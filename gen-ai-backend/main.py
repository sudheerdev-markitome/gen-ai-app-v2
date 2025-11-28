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

import openai
import google.generativeai as genai

# Explicitly import Sentry integration if you are using it
# from sentry_sdk.integrations.fastapi import FastApiIntegration
# import sentry_sdk

## -------------------
## CONFIGURATION
## -------------------
load_dotenv()

# Initialize Sentry (Optional - uncomment if using Sentry)
# SENTRY_BACKEND_DSN = os.getenv("SENTRY_BACKEND_DSN")
# if SENTRY_BACKEND_DSN:
#     sentry_sdk.init(
#         dsn=SENTRY_BACKEND_DSN,
#         traces_sample_rate=1.0,
#         profiles_sample_rate=1.0,
#         integrations=[FastApiIntegration()],
#     )

openai.api_key = os.getenv("OPENAI_API_KEY")
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
SERPER_API_KEY = os.getenv("SERPER_API_KEY") # Load the key

# --- ADMIN ACCESS CONTROL ---
# Replace with your actual email
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

# 1. The Actual Python Function
def get_current_server_time():
    """Returns the current UTC date and time."""
    return datetime.now(timezone.utc).isoformat()

# 2. NEW: Google Search Tool
def google_search(query):
    """Searches the internet using Google (via Serper API)."""
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query})
    headers = {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
    }
    try:
        response = requests.request("POST", url, headers=headers, data=payload)
        return response.text
    except Exception as e:
        return f"Error searching Google: {e}"

# 3. Update Tool Schema
available_tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_server_time",
            "description": "Get the current UTC date/time.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        }
    },
    # --- Add Search Tool Schema ---
    {
        "type": "function",
        "function": {
            "name": "google_search",
            "description": "Search the internet for current events, facts, or real-time information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query string (e.g., 'Apple stock price', 'latest AI news')"
                    }
                },
                "required": ["query"],
            },
        }
    }
]

# 4. Update Tool Map
tool_functions = {
    "get_current_server_time": get_current_server_time,
    "google_search": google_search # <-- Add mapping
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
         print("CRITICAL: JWKS keys not loaded, cannot validate token.")
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
        print(f"Token 'kid' {unverified_header.get('kid')} not found in JWKS.")
        raise credentials_exception

    try:
        payload = jwt.decode(
            token, rsa_key, algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
        )
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

## -------------------
## FASTAPI APP
## -------------------
app = FastAPI()

## -------------------
## API ENDPOINTS
## -------------------

@app.get("/api/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if user_email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    try:
        response = usage_logs_table.scan()
        items = response.get('Items', [])
        total_requests = len(items)
        total_tokens = sum(int(item.get('total_tokens', 0)) for item in items)
        model_usage = {}
        user_activity = {}
        for item in items:
            model = item.get('model', 'unknown')
            model_usage[model] = model_usage.get(model, 0) + 1
            uid = item.get('userId')
            user_activity[uid] = user_activity.get(uid, 0) + 1
        return {
            "total_requests": total_requests,
            "total_tokens": total_tokens,
            "model_usage": model_usage,
            "active_users_count": len(user_activity),
            "recent_logs": sorted(items, key=lambda x: x['timestamp'], reverse=True)[:20]
        }
    except Exception as e:
        print(f"Error fetching admin stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="User ID not found in token")
    try:
        response = chat_history_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(user_id)
        )
        items_by_conv = {}
        for item in response.get('Items', []):
            conv_id = item['conversationId']
            if conv_id not in items_by_conv: items_by_conv[conv_id] = []
            items_by_conv[conv_id].append(item)

        conversations = []
        for conv_id, items in items_by_conv.items():
            items.sort(key=lambda x: x['timestamp'])
            first_message = items[0]
            display_title = first_message.get('title', None) 
            if not display_title: display_title = first_message.get('text', 'New Chat')[:50]
            conversations.append({'id': conv_id, 'title': display_title})
        return sorted(conversations, key=lambda x: x['title'])
    except Exception as e:
        print(f"Error getting conversations for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id: raise HTTPException(status_code=403, detail="User ID not found in token")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if items and items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        items.sort(key=lambda x: x['timestamp'])
        return items
    except Exception as e: raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id: raise HTTPException(status_code=403, detail="User ID not found in token")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if not items: return {"detail": f"Conversation {conversation_id} not found or already deleted."}
        if items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        with chat_history_table.batch_writer() as batch:
            for item in items: batch.delete_item(Key={'conversationId': item['conversationId'],'timestamp': item['timestamp']})
        print(f"Deleted {len(items)} items for conversation {conversation_id}")
        return {"detail": f"Conversation {conversation_id} deleted successfully."}
    except Exception as e:
        print(f"Error deleting conversation {conversation_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/api/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, request: RenameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    new_title = request.new_title.strip()
    if not new_title: raise HTTPException(status_code=400, detail="New title cannot be empty")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id), ScanIndexForward=True)
        items = response.get('Items', [])
        if not items: raise HTTPException(status_code=404, detail="Conversation not found")
        if items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        first_message_timestamp = items[0]['timestamp']
        chat_history_table.update_item(Key={'conversationId': conversation_id, 'timestamp': first_message_timestamp}, UpdateExpression="SET title = :t", ExpressionAttributeValues={ ':t': new_title })
        return {"id": conversation_id, "title": new_title}
    except Exception as e:
        print(f"Error renaming conversation {conversation_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/conversations/{conversation_id}/share")
async def share_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if not items: raise HTTPException(status_code=404, detail="Conversation not found")
        if items[0].get('userId') != user_id: raise HTTPException(status_code=403, detail="Access denied")
        share_id = str(uuid.uuid4())
        shared_links_table.put_item(Item={'shareId': share_id, 'conversationId': conversation_id, 'created_at': datetime.now(timezone.utc).isoformat(), 'ownerId': user_id})
        return {"shareId": share_id, "url": f"/share/{share_id}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/share/{share_id}")
async def get_shared_conversation(share_id: str):
    try:
        response = shared_links_table.get_item(Key={'shareId': share_id})
        link_data = response.get('Item')
        if not link_data: raise HTTPException(status_code=404, detail="Shared link not found or expired")
        conversation_id = link_data['conversationId']
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        items.sort(key=lambda x: x['timestamp'])
        public_items = [{"text": item['text'], "sender": item['sender'], "timestamp": item['timestamp']} for item in items]
        return {"conversationId": conversation_id, "messages": public_items}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# --- MAIN GENERATE ENDPOINT (WITH AGENTIC TOOLS) ---
@app.post("/api/generate")
async def generate_text_sync(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    conversation_id = request.conversationId or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    display_prompt = request.prompt or ("Image Received" if request.image else "...")
    final_prompt_for_llm = request.prompt or ("Describe this image." if request.image else "")
    
    # 1. Save user message
    try:
        chat_history_table.put_item(Item={
            'conversationId': conversation_id, 'timestamp': f"{timestamp}_user",
            'userId': user_id, 'sender': 'user', 'text': display_prompt
        })
    except Exception as e:
         print(f"Error saving user message: {str(e)}")

    model_config = SUPPORTED_MODELS.get(request.model)
    if not model_config: raise HTTPException(status_code=400, detail="Model not supported")

    ai_response_text = ""
    usage_data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        if model_config["type"] == "openai":
            messages_for_api = []

            # --- FIX: FORCE TOOL AWARENESS IN SYSTEM PROMPT ---
            # Define a base system prompt that mentions the tools
            base_system_prompt = (
                "You are a helpful AI assistant. "
                "You have access to a 'google_search' tool that can search the internet for real-time information. "
                "You also have a 'get_current_server_time' tool. "
                "ALWAYS use the 'google_search' tool if the user asks about current events, news, stock prices, or anything that requires up-to-date knowledge. "
                "Do not say you cannot search the internet; just use the tool."
            )

            # Combine with user-provided system prompt if it exists

            if request.systemPrompt and request.systemPrompt.strip():
                final_system_prompt = f"{base_system_prompt}\n\nUser Instructions: {request.systemPrompt.strip()}"
            else:
                final_system_prompt = base_system_prompt

            messages_for_api.append({"role": "system", "content": final_system_prompt})
            # --------------------------------------------------
            
            if request.history:
                for msg in request.history:
                    role = "assistant" if msg.role == "model" else msg.role
                    messages_for_api.append({"role": role, "content": msg.content})

            user_content = []
            user_content.append({"type": "text", "text": final_prompt_for_llm})
            if request.image:
                user_content.append({"type": "image_url", "image_url": {"url": request.image}})
            messages_for_api.append({"role": "user", "content": user_content})

            # --- AGENT LOOP ---
            # First call: Send prompt + tools
            response = openai.chat.completions.create(
                model=model_config["name"],
                messages=messages_for_api,
                tools=available_tools, # Send tool definitions
                tool_choice="auto",
                max_tokens=1500
            )
            
            response_message = response.choices[0].message
            tool_calls = response_message.tool_calls

            # Check if AI wants to use a tool
            if tool_calls:
                print(f"AI wants to use {len(tool_calls)} tool(s).")
                # 1. Add AI's intent (tool calls) to history
                messages_for_api.append(response_message)

                # 2. Run tools
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    function_to_call = tool_functions.get(function_name)
                    function_response = ""
                    
                    if function_to_call:
                        # Execute the Python function
                        try:
                            function_response = function_to_call()
                        except Exception as tool_err:
                            function_response = f"Error executing tool: {tool_err}"
                    else:
                        function_response = f"Error: Tool {function_name} not found."

                    # 3. Add tool result to history
                    messages_for_api.append(
                        {
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": function_response,
                        }
                    )
                
                # 4. Second call: Send updated history back to AI for final answer
                second_response = openai.chat.completions.create(
                    model=model_config["name"],
                    messages=messages_for_api
                )
                ai_response_text = second_response.choices[0].message.content or ""
                if second_response.usage:
                    usage_data = {"prompt_tokens": second_response.usage.prompt_tokens, "completion_tokens": second_response.usage.completion_tokens, "total_tokens": second_response.usage.total_tokens}
            
            else:
                # No tool used, standard response
                ai_response_text = response_message.content or ""
                if response.usage:
                    usage_data = {"prompt_tokens": response.usage.prompt_tokens, "completion_tokens": response.usage.completion_tokens, "total_tokens": response.usage.total_tokens}

        elif model_config["type"] == "google":
            model = genai.GenerativeModel(model_config["name"])
            response = model.generate_content(final_prompt_for_llm)
            ai_response_text = response.text

    except Exception as e:
        print(f"Error calling AI: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error from AI service: {str(e)}")

    # 3. Save AI response
    ai_timestamp = datetime.now(timezone.utc).isoformat()
    try:
        chat_history_table.put_item(Item={
            'conversationId': conversation_id, 'timestamp': f"{ai_timestamp}_ai",
            'userId': user_id, 'sender': 'ai', 'text': ai_response_text
        })
        if usage_data['total_tokens'] > 0:
            usage_logs_table.put_item(Item={
                'userId': user_id,
                'timestamp': ai_timestamp,
                'model': request.model,
                'prompt_tokens': usage_data['prompt_tokens'],
                'completion_tokens': usage_data['completion_tokens'],
                'total_tokens': usage_data['total_tokens'],
                'user_email': current_user.get('email', 'unknown')
            })
    except Exception as e: print(f"Error saving logs: {str(e)}")

    return {"text": ai_response_text, "conversationId": conversation_id}