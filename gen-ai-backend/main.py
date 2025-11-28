# main.py
import os
import requests
import boto3
import boto3.dynamodb.conditions
from datetime import datetime, timezone
import uuid
from typing import List, Optional, Dict, Any
import json

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import jwt, jwk
from jose.exceptions import JOSEError
import boto3.dynamodb.conditions

import openai
import google.generativeai as genai

## -------------------
## CONFIGURATION
## -------------------
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
SERPER_API_KEY = os.getenv("SERPER_API_KEY")

# --- ADMIN ACCESS CONTROL ---
ADMIN_EMAILS = ["your.email@example.com", "sudheer@markitome.com"]

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")

dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
chat_history_table = dynamodb.Table('ChatHistory')
usage_logs_table = dynamodb.Table('UsageLogs')
shared_links_table = dynamodb.Table('SharedLinks')

SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai", "name": "gpt-4o" },
    "gpt-4": { "type": "openai", "name": "gpt-4" },
    "gemini-pro": { "type": "google", "name": "gemini-1.5-pro-latest" },
    "gemini-2.5-flash": { "type": "google", "name": "gemini-1.5-flash" }
}

## -------------------
## AGENT TOOLS DEFINITION
## -------------------

# 1. Server Time Tool
def get_current_server_time():
    """Returns the current UTC date and time."""
    return datetime.now(timezone.utc).isoformat()

# 2. Google Search Tool (Serper.dev)
def google_search(query):
    """Searches the internet using Google via Serper API."""
    if not SERPER_API_KEY:
        return "Error: SERPER_API_KEY not found. Please configure it on the server."
    
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query})
    headers = {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
    }
    try:
        print(f"Searching Google for: {query}")
        response = requests.request("POST", url, headers=headers, data=payload)
        return response.text
    except Exception as e:
        print(f"Search failed: {e}")
        return f"Error searching Google: {e}"

# 3. Tool Schemas (Description for OpenAI)
available_tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_server_time",
            "description": "Get the current UTC date and time. Use this when asked for 'now', 'today', or 'time'.",
            "parameters": {
                "type": "object", 
                "properties": {}, 
                "required": []
            },
        }
    },
    {
        "type": "function",
        "function": {
            "name": "google_search",
            "description": "Search the internet for real-time information, news, facts, or data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query (e.g., 'Apple stock price', 'SpaceX launch news')"
                    }
                },
                "required": ["query"],
            },
        }
    }
]

# 4. Tool Map (Execute function by name)
tool_functions = {
    "get_current_server_time": get_current_server_time,
    "google_search": google_search
}

## -------------------
## AUTHENTICATION
## -------------------
COGNITO_JWKS_URL = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

try:
    response = requests.get(COGNITO_JWKS_URL)
    response.raise_for_status()
    jwks = response.json()
except requests.exceptions.RequestException as e:
    print(f"CRITICAL: Could not fetch Cognito JWKS - {e}")
    jwks = {"keys": []}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not jwks or not jwks.get("keys"):
         print("CRITICAL: JWKS keys not loaded.")
         raise credentials_exception

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JOSEError:
        raise credentials_exception

    rsa_key = {}
    for key in jwks["keys"]:
        if key.get("kid") == unverified_header.get("kid"):
            rsa_key = {
                "kty": key.get("kty"), "kid": key.get("kid"), "use": key.get("use"),
                "n": key.get("n"), "e": key.get("e")
            }
            break

    if not rsa_key:
        raise credentials_exception

    try:
        payload = jwt.decode(token, rsa_key, algorithms=["RS256"], audience=COGNITO_APP_CLIENT_ID, issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}")
        return payload
    except Exception:
         raise credentials_exception

## -------------------
## PYDANTIC MODELS
## -------------------
class RenameRequest(BaseModel):
    new_title: str
class ChatMessage(BaseModel):
    role: str
    content: str
class PromptRequest(BaseModel):
    prompt: Optional[str] = None
    model: str
    conversationId: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    image: Optional[str] = None
    systemPrompt: Optional[str] = None

app = FastAPI()

# --- ENDPOINTS (Stats, Conversations, etc.) ---
@app.get("/api/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if user_email not in ADMIN_EMAILS: raise HTTPException(status_code=403, detail="Access denied.")
    try:
        response = usage_logs_table.scan()
        items = response.get('Items', [])
        return {"total_requests": len(items), "recent_logs": sorted(items, key=lambda x: x['timestamp'], reverse=True)[:20]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(user_id))
        items_by_conv = {}
        for item in response.get('Items', []):
            conv_id = item['conversationId']
            if conv_id not in items_by_conv: items_by_conv[conv_id] = []
            items_by_conv[conv_id].append(item)
        conversations = []
        for conv_id, items in items_by_conv.items():
            items.sort(key=lambda x: x['timestamp'])
            title = items[0].get('title') or items[0].get('text', 'New Chat')[:50]
            conversations.append({'id': conv_id, 'title': title})
        return sorted(conversations, key=lambda x: x['title'])
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if items and items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        items.sort(key=lambda x: x['timestamp'])
        return items
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if not items: return {"detail": "Not found"}
        if items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        with chat_history_table.batch_writer() as batch:
            for item in items: batch.delete_item(Key={'conversationId': item['conversationId'],'timestamp': item['timestamp']})
        return {"detail": "Deleted"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, request: RenameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id), ScanIndexForward=True)
        items = response.get('Items', [])
        if not items: raise HTTPException(status_code=404, detail="Not found")
        if items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        chat_history_table.update_item(Key={'conversationId': conversation_id, 'timestamp': items[0]['timestamp']}, UpdateExpression="SET title = :t", ExpressionAttributeValues={ ':t': request.new_title })
        return {"id": conversation_id, "title": request.new_title}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/conversations/{conversation_id}/share")
async def share_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if not items or items[0].get('userId') != user_id: raise HTTPException(status_code=404, detail="Error sharing")
        share_id = str(uuid.uuid4())
        shared_links_table.put_item(Item={'shareId': share_id, 'conversationId': conversation_id, 'created_at': datetime.now(timezone.utc).isoformat(), 'ownerId': user_id})
        return {"shareId": share_id, "url": f"/share/{share_id}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/share/{share_id}")
async def get_shared_conversation(share_id: str):
    try:
        response = shared_links_table.get_item(Key={'shareId': share_id})
        link_data = response.get('Item')
        if not link_data: raise HTTPException(status_code=404, detail="Link not found")
        conversation_id = link_data['conversationId']
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        items.sort(key=lambda x: x['timestamp'])
        return {"conversationId": conversation_id, "messages": [{"text": i['text'], "sender": i['sender']} for i in items]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


# --- MAIN GENERATE ENDPOINT WITH AGENT TOOLS ---
@app.post("/api/generate")
async def generate_text_sync(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    conversation_id = request.conversationId or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    display_prompt = request.prompt or ("Image Received" if request.image else "...")
    final_prompt_for_llm = request.prompt or ("Describe this image." if request.image else "")

    # 1. Save User Message
    chat_history_table.put_item(Item={'conversationId': conversation_id, 'timestamp': f"{timestamp}_user", 'userId': user_id, 'sender': 'user', 'text': display_prompt})

    model_config = SUPPORTED_MODELS.get(request.model)
    ai_response_text = ""
    
    try:
        if model_config["type"] == "openai":
            messages_for_api = []
            
            # --- SYSTEM PROMPT: FORCE TOOL USE ---
            base_system = (
                "You are a helpful AI assistant with access to tools. "
                "If the user asks for current news, stock prices, or real-time info, YOU MUST USE the 'google_search' tool. "
                "If they ask for time, use 'get_current_server_time'. "
                "Do not say you cannot browse the internet; use the tool instead."
            )
            final_sys_prompt = f"{base_system}\n{request.systemPrompt}" if request.systemPrompt else base_system
            messages_for_api.append({"role": "system", "content": final_sys_prompt})
            # -------------------------------------

            if request.history:
                for msg in request.history:
                    messages_for_api.append({"role": "assistant" if msg.role == "model" else msg.role, "content": msg.content})

            user_content = [{"type": "text", "text": final_prompt_for_llm}]
            if request.image: user_content.append({"type": "image_url", "image_url": {"url": request.image}})
            messages_for_api.append({"role": "user", "content": user_content})

            # --- AGENT LOOP ---
            response = openai.chat.completions.create(
                model=model_config["name"],
                messages=messages_for_api,
                tools=available_tools, # Send tools
                tool_choice="auto",
                max_tokens=1500
            )
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            if tool_calls:
                print(f"AI triggering {len(tool_calls)} tools...")
                messages_for_api.append(response_message) # Add AI's intent

                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = tool_functions.get(function_name)
                    function_args = json.loads(tool_call.function.arguments)
                    
                    function_response = ""
                    if function_to_call:
                        try:
                            # Handle google_search with arguments
                            if function_name == "google_search":
                                function_response = function_to_call(query=function_args.get("query"))
                            else:
                                function_response = function_to_call() # No args for time
                        except Exception as err:
                            function_response = f"Error executing tool: {err}"
                    else:
                        function_response = f"Error: Tool {function_name} not found."

                    messages_for_api.append({
                        "tool_call_id": tool_call.id,
                        "role": "tool",
                        "name": function_name,
                        "content": function_response,
                    })
                
                # Second call to get final answer
                second_response = openai.chat.completions.create(
                    model=model_config["name"],
                    messages=messages_for_api
                )
                ai_response_text = second_response.choices[0].message.content or ""
            else:
                ai_response_text = response_message.content or ""

        elif model_config["type"] == "google":
             model = genai.GenerativeModel(model_config["name"])
             response = model.generate_content(final_prompt_for_llm)
             ai_response_text = response.text

    except Exception as e:
        print(f"AI Error: {e}")
        ai_response_text = f"I encountered an error processing your request: {str(e)}"

    # 3. Save AI Response
    ai_timestamp = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={'conversationId': conversation_id, 'timestamp': f"{ai_timestamp}_ai", 'userId': user_id, 'sender': 'ai', 'text': ai_response_text})

    return {"text": ai_response_text, "conversationId": conversation_id}