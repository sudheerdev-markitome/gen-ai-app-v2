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
user_feedback_table = dynamodb.Table('UserFeedback') # Ensure this table exists in DynamoDB

SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai", "name": "gpt-4o" },
    "gpt-4": { "type": "openai", "name": "gpt-4" },
    "gemini-pro": { "type": "google", "name": "gemini-1.5-pro-latest" },
    "gemini-2.5-flash": { "type": "google", "name": "gemini-1.5-flash" }
}

## -------------------
## AGENT TOOLS DEFINITION
## -------------------
def get_current_server_time():
    return datetime.now(timezone.utc).isoformat()

def google_search(query):
    if not SERPER_API_KEY: return "Error: SERPER_API_KEY not configured."
    url = "https://google.serper.dev/search"
    try:
        response = requests.post(url, headers={'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json'}, json={"q": query})
        return response.text
    except Exception as e: return f"Search failed: {e}"

available_tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_server_time",
            "description": "Get current UTC time.",
            "parameters": { "type": "object", "properties": {}, "required": [] }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "google_search",
            "description": "Search internet for real-time info.",
            "parameters": {
                "type": "object",
                "properties": { "query": { "type": "string", "description": "Search query" } },
                "required": ["query"]
            }
        }
    }
]

tool_functions = {
    "get_current_server_time": get_current_server_time,
    "google_search": google_search
}

## -------------------
## AUTHENTICATION
## -------------------
COGNITO_JWKS_URL = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
try:
    response = requests.get(COGNITO_JWKS_URL); response.raise_for_status(); jwks = response.json()
except Exception as e:
    print(f"CRITICAL: Could not fetch JWKS - {e}"); jwks = {"keys": []}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials", headers={"WWW-Authenticate": "Bearer"})
    if not jwks or not jwks.get("keys"): raise credentials_exception
    try: unverified_header = jwt.get_unverified_header(token)
    except JOSEError: raise credentials_exception
    rsa_key = {}
    for key in jwks["keys"]:
        if key.get("kid") == unverified_header.get("kid"): rsa_key = key; break
    if not rsa_key: raise credentials_exception
    try:
        return jwt.decode(token, rsa_key, algorithms=["RS256"], audience=COGNITO_APP_CLIENT_ID, issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}")
    except Exception: raise credentials_exception

## -------------------
## PYDANTIC MODELS
## -------------------
class RenameRequest(BaseModel): new_title: str
class ChatMessage(BaseModel): role: str; content: str
class PromptRequest(BaseModel):
    prompt: Optional[str] = None; model: str; conversationId: Optional[str] = None
    history: Optional[List[ChatMessage]] = None; image: Optional[str] = None; systemPrompt: Optional[str] = None
class FeedbackRequest(BaseModel):
    message: str; category: str = "bug"

app = FastAPI()

## -------------------
## ENDPOINTS
## -------------------

# --- FEEDBACK (This was missing) ---
@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest, current_user: dict = Depends(get_current_user)):
    try:
        user_feedback_table.put_item(Item={
            'feedbackId': str(uuid.uuid4()),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'userId': current_user.get("sub"),
            'userEmail': current_user.get("email", "unknown"),
            'category': request.category,
            'message': request.message,
            'status': 'new'
        })
        return {"detail": "Feedback submitted"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/feedback")
async def get_admin_feedback(current_user: dict = Depends(get_current_user)):
    if current_user.get("email") not in ADMIN_EMAILS: raise HTTPException(status_code=403, detail="Access denied")
    try:
        response = user_feedback_table.scan()
        return sorted(response.get('Items', []), key=lambda x: x['timestamp'], reverse=True)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# --- STATS ---
@app.get("/api/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    if current_user.get("email") not in ADMIN_EMAILS: raise HTTPException(status_code=403, detail="Access denied")
    try:
        response = usage_logs_table.scan()
        items = response.get('Items', [])
        total_tokens = sum(int(i.get('total_tokens', 0)) for i in items)
        model_usage = {}; user_activity = {}
        for i in items:
            m = i.get('model', 'unknown'); model_usage[m] = model_usage.get(m, 0) + 1
            u = i.get('userId'); user_activity[u] = user_activity.get(u, 0) + 1
        return {
            "total_requests": len(items), "total_tokens": total_tokens, "model_usage": model_usage,
            "active_users_count": len(user_activity), "recent_logs": sorted(items, key=lambda x: x['timestamp'], reverse=True)[:20]
        }
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# --- CONVERSATIONS ---
@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    try:
        response = chat_history_table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(current_user.get("sub")))
        conversations = {}
        for item in response.get('Items', []):
            cid = item['conversationId']
            if cid not in conversations: conversations[cid] = {'id': cid, 'title': item.get('title') or item.get('text', 'New Chat')[:50]}
        return sorted(list(conversations.values()), key=lambda x: x['title'])
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations/{conversation_id}")
async def get_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        items = response.get('Items', [])
        if items and items[0].get('userId') != current_user.get("sub"): raise HTTPException(status_code=403, detail="Access denied")
        return sorted(items, key=lambda x: x['timestamp'])
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/conversations/{conversation_id}")
async def delete_conv(conversation_id: str, current_user: dict = Depends(get_current_user)):
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id))
        with chat_history_table.batch_writer() as batch:
            for item in response.get('Items', []): batch.delete_item(Key={'conversationId': item['conversationId'], 'timestamp': item['timestamp']})
        return {"detail": "Deleted"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/conversations/{conversation_id}")
async def rename_conv(conversation_id: str, req: RenameRequest, current_user: dict = Depends(get_current_user)):
    try:
        response = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id), ScanIndexForward=True)
        items = response.get('Items', [])
        if not items: raise HTTPException(status_code=404, detail="Not found")
        chat_history_table.update_item(Key={'conversationId': conversation_id, 'timestamp': items[0]['timestamp']}, UpdateExpression="SET title = :t", ExpressionAttributeValues={':t': req.new_title})
        return {"id": conversation_id, "title": req.new_title}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/conversations/{conversation_id}/share")
async def share_conv(conversation_id: str, current_user: dict = Depends(get_current_user)):
    try:
        sid = str(uuid.uuid4())
        shared_links_table.put_item(Item={'shareId': sid, 'conversationId': conversation_id, 'created_at': datetime.now(timezone.utc).isoformat()})
        return {"shareId": sid, "url": f"/share/{sid}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/share/{share_id}")
async def get_shared(share_id: str):
    try:
        resp = shared_links_table.get_item(Key={'shareId': share_id})
        if not resp.get('Item'): raise HTTPException(status_code=404, detail="Link not found")
        cid = resp['Item']['conversationId']
        msgs = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(cid))['Items']
        return {"conversationId": cid, "messages": sorted([{"text": i['text'], "sender": i['sender']} for i in msgs], key=lambda x: x['timestamp'])}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# --- GENERATE (With Tools) ---
@app.post("/api/generate")
async def generate_text_sync(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    conversation_id = request.conversationId or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    display_prompt = request.prompt or ("Image Received" if request.image else "...")
    
    chat_history_table.put_item(Item={'conversationId': conversation_id, 'timestamp': f"{timestamp}_user", 'userId': user_id, 'sender': 'user', 'text': display_prompt})

    model_config = SUPPORTED_MODELS.get(request.model)
    ai_response_text = ""
    usage_data = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        if model_config["type"] == "openai":
            messages = []
            # System Prompt
            sys_p = "You are a helpful assistant. If asked for time, use get_current_server_time. If asked for news/info, use google_search."
            if request.systemPrompt: sys_p += f"\n{request.systemPrompt}"
            messages.append({"role": "system", "content": sys_p})

            if request.history:
                for m in request.history: messages.append({"role": "assistant" if m.role == "model" else m.role, "content": m.content})
            
            user_content = [{"type": "text", "text": request.prompt or "Describe image"}]
            if request.image: user_content.append({"type": "image_url", "image_url": {"url": request.image}})
            messages.append({"role": "user", "content": user_content})

            response = openai.chat.completions.create(model=model_config["name"], messages=messages, tools=available_tools, tool_choice="auto", max_tokens=1500)
            msg = response.choices[0].message
            
            if msg.tool_calls:
                messages.append(msg)
                for tool in msg.tool_calls:
                    func = tool_functions.get(tool.function.name)
                    if func:
                        args = json.loads(tool.function.arguments)
                        res = func(args.get('query')) if tool.function.name == 'google_search' else func()
                        messages.append({"tool_call_id": tool.id, "role": "tool", "name": tool.function.name, "content": str(res)})
                    else:
                        messages.append({"tool_call_id": tool.id, "role": "tool", "name": tool.function.name, "content": "Error: Tool not found"})
                
                resp2 = openai.chat.completions.create(model=model_config["name"], messages=messages)
                ai_response_text = resp2.choices[0].message.content
                if resp2.usage: usage_data = dict(resp2.usage)
            else:
                ai_response_text = msg.content
                if response.usage: usage_data = dict(response.usage)

        elif model_config["type"] == "google":
            model = genai.GenerativeModel(model_config["name"])
            ai_response_text = model.generate_content(request.prompt or "Image").text

    except Exception as e: ai_response_text = f"Error: {str(e)}"

    ai_ts = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={'conversationId': conversation_id, 'timestamp': f"{ai_ts}_ai", 'userId': user_id, 'sender': 'ai', 'text': ai_response_text})
    
    if usage_data.get('total_tokens', 0) > 0:
        usage_logs_table.put_item(Item={
            'userId': user_id, 'timestamp': ai_ts, 'model': request.model, 
            'prompt_tokens': usage_data.get('prompt_tokens'), 'completion_tokens': usage_data.get('completion_tokens'), 
            'total_tokens': usage_data.get('total_tokens'), 'user_email': current_user.get("email")
        })

    return {"text": ai_response_text, "conversationId": conversation_id}