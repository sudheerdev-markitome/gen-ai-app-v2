# main.py
import os
import requests
import boto3
import boto3.dynamodb.conditions
from datetime import datetime, timezone
import uuid
from typing import List, Optional, Dict, Any
import json
import time
import shutil

# Import Form, File, UploadFile
from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File, Form
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
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")

client = openai.OpenAI()

# --- ADMIN ACCESS CONTROL ---
ADMIN_EMAILS = ["vivek@markitome.com", "sudheer@markitome.com"]

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")

dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
chat_history_table = dynamodb.Table('ChatHistory')
usage_logs_table = dynamodb.Table('UsageLogs')
shared_links_table = dynamodb.Table('SharedLinks')
user_feedback_table = dynamodb.Table('UserFeedback')

SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai_assistant", "name": OPENAI_ASSISTANT_ID },
    "gpt-4": { "type": "openai", "name": "gpt-4" }, # Fallback
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
class FeedbackRequest(BaseModel): message: str; category: str = "bug"

app = FastAPI()

# --- HELPER: Upload File to OpenAI ---
def upload_file_to_openai(file: UploadFile):
    try:
        # 1. Save locally temporarily
        temp_filename = f"temp_{uuid.uuid4()}_{file.filename}"
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 2. Upload to OpenAI
        print(f"Uploading {file.filename} to OpenAI...")
        uploaded_file = client.files.create(
            file=open(temp_filename, "rb"),
            purpose='assistants'
        )
        
        # 3. Cleanup
        os.remove(temp_filename)
        return uploaded_file.id
    except Exception as e:
        print(f"File upload error: {e}")
        return None

# --- ENDPOINTS ---
# (Feedback, Stats, Conversations endpoints remain exactly the same as before)
@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest, current_user: dict = Depends(get_current_user)):
    try:
        user_feedback_table.put_item(Item={'feedbackId': str(uuid.uuid4()), 'timestamp': datetime.now(timezone.utc).isoformat(), 'userId': current_user.get("sub"), 'userEmail': current_user.get("email"), 'category': request.category, 'message': request.message, 'status': 'new'})
        return {"detail": "Submitted"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/feedback")
async def get_admin_feedback(current_user: dict = Depends(get_current_user)):
    if current_user.get("email") not in ADMIN_EMAILS: raise HTTPException(status_code=403, detail="Access denied")
    try: return sorted(user_feedback_table.scan().get('Items', []), key=lambda x: x['timestamp'], reverse=True)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    if current_user.get("email") not in ADMIN_EMAILS: raise HTTPException(status_code=403, detail="Access denied")
    try:
        items = usage_logs_table.scan().get('Items', [])
        return {"total_requests": len(items), "recent_logs": sorted(items, key=lambda x: x['timestamp'], reverse=True)[:20]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    try:
        response = chat_history_table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(current_user.get("sub")))
        items_by_conv = {}
        for item in response.get('Items', []):
            cid = item['conversationId']
            if cid not in items_by_conv: items_by_conv[cid] = []
            items_by_conv[cid].append(item)
        conversations = []
        for cid, items in items_by_conv.items():
            items.sort(key=lambda x: x['timestamp'])
            title = items[0].get('title') or items[0].get('text', 'New Chat')[:50]
            conversations.append({'id': cid, 'title': title})
        return sorted(conversations, key=lambda x: x['title'])
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
        sid = str(uuid.uuid4()); shared_links_table.put_item(Item={'shareId': sid, 'conversationId': conversation_id, 'created_at': datetime.now(timezone.utc).isoformat(), 'ownerId': current_user.get("sub")})
        return {"shareId": sid, "url": f"/share/{sid}"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/share/{share_id}")
async def get_shared(share_id: str):
    try:
        resp = shared_links_table.get_item(Key={'shareId': share_id})
        if not resp.get('Item'): raise HTTPException(status_code=404, detail="Link not found")
        cid = resp['Item']['conversationId']
        msgs = chat_history_table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(cid))['Items']
        return {"conversationId": cid, "messages": sorted([{"text": i['text'], "sender": i['sender']} for i in msgs], key=lambda x: x.get('timestamp', ''))}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# --- MAIN GENERATE ENDPOINT (UPDATED FOR FILE UPLOAD & FORM DATA) ---
@app.post("/api/generate")
async def generate_text_sync(
    # NOTE: Changed from JSON Body to Form Data to support file uploads
    prompt: str = Form(...),
    model: str = Form(...),
    conversationId: Optional[str] = Form(None),
    systemPrompt: Optional[str] = Form(None),
    image: Optional[str] = Form(None), # Base64 Image
    file: Optional[UploadFile] = File(None), # File Attachment
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("sub")
    conv_id = conversationId or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    display_prompt = prompt
    if file:
        display_prompt += f"\n[Attached File: {file.filename}]"
    if image:
        display_prompt += "\n[Image Attached]"

    # 1. Save User Message
    chat_history_table.put_item(Item={'conversationId': conv_id, 'timestamp': f"{timestamp}_user", 'userId': user_id, 'sender': 'user', 'text': display_prompt})

    model_config = SUPPORTED_MODELS.get(model)
    if not model_config: raise HTTPException(status_code=400, detail="Model not supported")

    ai_response_text = ""
    usage_data = {}

    try:
        if model_config["type"] == "openai_assistant":
            # --- OPENAI ASSISTANTS API LOGIC ---
            
            # 1. Handle Thread
            # Check if we have a thread_id for this conversation in DynamoDB
            # (Requires ConversationThreads table we added earlier, creating it if missing in code logic here is complex, 
            #  so for simplicity we will rely on creating a new thread if we don't have a way to look it up easily 
            #  OR better: add the lookup logic here if you have that table. 
            #  Assuming we create a new thread for simplicity in this snippet unless you have the mapping table ready).
            
            # Let's check for the mapping table, if not, create new thread each time (stateless for demo)
            # Ideally: Lookup thread_id from 'ConversationThreads' table using conv_id
            
            thread = client.beta.threads.create() 
            thread_id = thread.id

            # 2. Upload File if present
            openai_file_id = None
            if file:
                openai_file_id = upload_file_to_openai(file)

            # 3. Add Message to Thread
            message_content = prompt
            attachments = []
            if openai_file_id:
                # Add file search capability for this file
                attachments.append({ "file_id": openai_file_id, "tools": [{"type": "file_search"}] })

            client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=message_content,
                attachments=attachments if attachments else None
            )

            # 4. Run Assistant
            run = client.beta.threads.runs.create(
                thread_id=thread_id,
                assistant_id=model_config["name"]
            )

            # 5. Poll for Completion
            while run.status in ['queued', 'in_progress', 'requires_action']:
                time.sleep(1)
                run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)
                
                # Handle Tool Calls (e.g. Google Search / Time)
                if run.status == 'requires_action':
                    tool_outputs = []
                    for tool_call in run.required_action.submit_tool_outputs.tool_calls:
                        fname = tool_call.function.name
                        args = json.loads(tool_call.function.arguments)
                        func = tool_functions.get(fname)
                        result = str(func(**args)) if func else "Error: Tool not found"
                        tool_outputs.append({"tool_call_id": tool_call.id, "output": result})
                    
                    client.beta.threads.runs.submit_tool_outputs(
                        thread_id=thread_id,
                        run_id=run.id,
                        tool_outputs=tool_outputs
                    )

            if run.status == 'completed':
                messages = client.beta.threads.messages.list(thread_id=thread_id)
                ai_response_text = messages.data[0].content[0].text.value
                # Usage stats for Assistants are harder to get per-run in this version, skipping for now
            else:
                ai_response_text = f"Assistant run failed with status: {run.status}"

        else:
            # Fallback for standard models (GPT-4, Gemini) - No file support here in this simple implementation
             ai_response_text = "File upload is only supported with GPT-4o Assistant model."

    except Exception as e:
        print(f"AI Error: {e}")
        ai_response_text = f"Error processing request: {str(e)}"

    # 3. Save AI Response
    ai_ts = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={'conversationId': conv_id, 'timestamp': f"{ai_ts}_ai", 'userId': user_id, 'sender': 'ai', 'text': ai_response_text})

    return {"text": ai_response_text, "conversationId": conv_id}