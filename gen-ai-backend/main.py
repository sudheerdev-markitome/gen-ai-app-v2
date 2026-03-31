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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import jwt, jwk
from jose.exceptions import JOSEError

import openai
import google.generativeai as genai
import anthropic
from groq import Groq

# Diagnostic for Mistral import issue
try:
    import mistralai
    print(f"DEBUG: mistralai package found at {mistralai.__file__}")
    from mistralai import Mistral
    print("DEBUG: Successfully imported Mistral from mistralai")
except ImportError as e:
    print(f"ERROR: Failed to import Mistral or mistralai: {e}")
    # Fallback to old client if necessary for diagnostic purposes, 
    # but the goal is to fix the environment to use the new SDK.
    Mistral = None 
except Exception as e:
    print(f"CRITICAL: Unexpected error importing mistralai: {e}")
    Mistral = None

## -------------------
## CONFIGURATION
## -------------------
load_dotenv()
print(f"DEBUG: .env loaded. OpenAI Key found: {bool(os.getenv('OPENAI_API_KEY'))}")
openai.api_key = os.getenv("OPENAI_API_KEY")
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
OPENAI_ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")

# OpenAI Client
openai_key = os.getenv("OPENAI_API_KEY")
client = openai.OpenAI(api_key=openai_key) if openai_key else None

# Anthropic Client (Claude)
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
anthropic_client = anthropic.Anthropic(api_key=anthropic_key) if (anthropic_key and "your_anthropic" not in anthropic_key) else None

# Groq Client (Llama 3)
groq_key = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=groq_key) if (groq_key and "your_groq" not in groq_key) else None

# Mistral Client
mistral_key = os.getenv("MISTRAL_API_KEY")
mistral_client = Mistral(api_key=mistral_key) if (Mistral and mistral_key and "your_mistral" not in mistral_key) else None

# --- ADMIN ACCESS CONTROL ---
ADMIN_EMAILS = ["vivek@markitome.com", "sudheer@markitome.com"]

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")
SES_SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL", "noreply@markitome.com")
SES_REGION = os.getenv("SES_REGION", COGNITO_REGION)

dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
ses_client = boto3.client('ses', region_name=SES_REGION)
chat_history_table = dynamodb.Table('ChatHistory')
usage_logs_table = dynamodb.Table('UsageLogs')
shared_links_table = dynamodb.Table('SharedLinks')
user_feedback_table = dynamodb.Table('UserFeedback')
registration_leads_table = dynamodb.Table('RegistrationLeads')

SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai_assistant", "name": OPENAI_ASSISTANT_ID },
    "gpt-4": { "type": "openai", "name": "gpt-4" }, # Fallback
    "gemini-pro": { "type": "google", "name": "gemini-pro-latest" },
    "gemini-2.5-flash": { "type": "google", "name": "gemini-flash-latest" },
    "dall-e-3": { "type": "image", "name": "dall-e-3" },
    "claude-3-5-sonnet": { "type": "anthropic", "name": "claude-3-5-sonnet-20241022" },
    "llama-4-scout": { "type": "groq", "name": "meta-llama/llama-4-scout-17b-16e-instruct" },
    "mistral-large": { "type": "mistral", "name": "mistral-large-latest" }
}

# --- VALIDATION ---
if OPENAI_ASSISTANT_ID and not OPENAI_ASSISTANT_ID.startswith("asst_"):
    print("WARNING: OPENAI_ASSISTANT_ID in .env does not start with 'asst_'. GPT-4o Assistant calls will fail.")


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

def send_admin_notification(subject: str, body: str):
    """Sends a notification email to all admin emails using Amazon SES."""
    if not SES_SENDER_EMAIL:
        print("SES_SENDER_EMAIL not configured. Skipping notification.")
        return
    
    try:
        response = ses_client.send_email(
            Source=SES_SENDER_EMAIL,
            Destination={'ToAddresses': ADMIN_EMAILS},
            Message={
                'Subject': {'Data': subject},
                'Body': {'Text': {'Data': body}}
            }
        )
        return response
    except Exception as e:
        print(f"Failed to send SES notification: {e}")
        return None

## -------------------
## AUTHENTICATION
## -------------------
COGNITO_JWKS_URL = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
jwks = {"keys": []}
try:
    if COGNITO_USER_POOL_ID:
        response = requests.get(COGNITO_JWKS_URL, timeout=5)
        response.raise_for_status()
        jwks = response.json()
    else:
        print("WARNING: COGNITO_USER_POOL_ID not set. Auth will fail.")
except Exception as e:
    print(f"CRITICAL WARNING: Failed to fetch Cognito JWKS: {e}. Auth will fail.")
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

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production you might want to restrict this to ["https://markitome.ai"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cognito_configured": bool(COGNITO_USER_POOL_ID)
    }

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
class AccessRequest(BaseModel):
    fullName: Optional[str] = "Unknown"
    companyName: Optional[str] = "Unknown"
    phoneNumber: Optional[str] = "Unknown"
    email: Optional[str] = "Unknown"
    details: Optional[str] = ""

@app.post("/api/notify/access-request")
async def notify_access_request(request: AccessRequest):
    """Endpoint to notify admins when someone fills the Request Access form."""
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # 1. Save to DynamoDB
    try:
        registration_leads_table.put_item(Item={
            'leadId': str(uuid.uuid4()),
            'fullName': request.fullName,
            'companyName': request.companyName,
            'phoneNumber': request.phoneNumber,
            'email': request.email,
            'details': request.details,
            'timestamp': timestamp,
            'status': 'new'
        })
    except Exception as e:
        print(f"Failed to save lead to DynamoDB: {e}")

    # 2. Send Notification
    subject = "🚀 New Access Request - Markitome AI"
    body = (
        f"Hello Admin,\n\n"
        f"A new user has requested access through the form.\n\n"
        f"Full Name: {request.fullName}\n"
        f"Company Name: {request.companyName}\n"
        f"Phone Number: {request.phoneNumber}\n"
        f"Email: {request.email}\n"
        f"Details: {request.details}\n"
        f"Timestamp: {timestamp}\n\n"
        f"Best,\nMarkitome System"
    )
    
    success = send_admin_notification(subject, body)
    return {"message": "Notification process complete", "success": bool(success)}

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
    history: Optional[str] = Form(None), # Added to handle chat history
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
    
    try:
        parsed_history = []
        if history:
            try:
                parsed_history = json.loads(history)
            except:
                pass

        if model_config["type"] == "openai_assistant":
            # --- OPENAI ASSISTANTS API LOGIC ---
            # (Thread persistence could be added here later)
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
            else:
                ai_response_text = f"Assistant run failed with status: {run.status}"

        elif model_config["type"] == "google":
            # --- GOOGLE GEMINI LOGIC ---
            gemini_model = genai.GenerativeModel(model_config["name"])
            
            # Format history for Gemini
            gemini_history = []
            for h in parsed_history:
                # Role mapping: 'user' stays 'user', 'model'
                gemini_history.append({
                    "role": h.get("role", "user"),
                    "parts": [h.get("content", "")]
                })
            
            chat = gemini_model.start_chat(history=gemini_history)
            response = chat.send_message(display_prompt)
            ai_response_text = response.text

        elif model_config["type"] == "openai":
            # --- STANDARD OPENAI (GPT-4) LOGIC ---
            messages = []
            if systemPrompt:
                messages.append({"role": "system", "content": systemPrompt})
            
            for h in parsed_history:
                # Role mapping: 'model' -> 'assistant'
                role = "assistant" if h.get("role") == "model" else "user"
                messages.append({"role": role, "content": h.get("content", "")})
            
            messages.append({"role": "user", "content": display_prompt})
            
            response = client.chat.completions.create(
                model=model_config["name"],
                messages=messages
            )
            ai_response_text = response.choices[0].message.content

        elif model_config["type"] == "image":
            # --- OPENAI DALL-E IMAGE GENERATION ---
            response = client.images.generate(
                model=model_config["name"],
                prompt=display_prompt,
                n=1,
                size="1024x1024",
                quality="standard",
            )
            image_url = response.data[0].url
            ai_response_text = f"![Generated Image]({image_url})"

        elif model_config["type"] == "anthropic":
            # --- ANTHROPIC CLAUDE LOGIC ---
            if not anthropic_client:
                raise HTTPException(status_code=400, detail="Anthropic is not configured. Please check your ANTHROPIC_API_KEY.")
            messages = []
            for h in parsed_history:
                # Anthropic uses 'user' and 'assistant'
                role = "assistant" if h.get("role") == "model" else "user"
                messages.append({"role": role, "content": h.get("content", "")})
            messages.append({"role": "user", "content": display_prompt})

            anthropic_resp = anthropic_client.messages.create(
                model=model_config["name"],
                max_tokens=4096,
                system=systemPrompt or "You are a helpful assistant.",
                messages=messages
            )
            ai_response_text = anthropic_resp.content[0].text

        elif model_config["type"] == "groq":
            # --- GROQ (LLAMA 3) LOGIC ---
            if not groq_client:
                raise HTTPException(status_code=400, detail="Groq is not configured. Please check your GROQ_API_KEY.")
            messages = []
            if systemPrompt:
                messages.append({"role": "system", "content": systemPrompt})
            for h in parsed_history:
                role = "assistant" if h.get("role") == "model" else "user"
                messages.append({"role": role, "content": h.get("content", "")})
            messages.append({"role": "user", "content": display_prompt})

            groq_resp = groq_client.chat.completions.create(
                model=model_config["name"],
                messages=messages
            )
            ai_response_text = groq_resp.choices[0].message.content

        elif model_config["type"] == "mistral":
            # --- MISTRAL LOGIC ---
            if not mistral_client:
                raise HTTPException(status_code=400, detail="Mistral is not configured. Please check your MISTRAL_API_KEY.")
            messages = []
            if systemPrompt:
                messages.append({"role": "system", "content": systemPrompt})
            for h in parsed_history:
                role = "assistant" if h.get("role") == "model" else "user"
                messages.append({"role": role, "content": h.get("content", "")})
            messages.append({"role": "user", "content": display_prompt})

            mistral_resp = mistral_client.chat.complete(
                model=model_config["name"],
                messages=messages
            )
            ai_response_text = mistral_resp.choices[0].message.content

        else:
            ai_response_text = "Model type not supported."

    except Exception as e:
        print(f"AI Error: {e}")
        ai_response_text = f"Error processing request: {str(e)}"

    # 3. Save AI Response
    ai_ts = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={'conversationId': conv_id, 'timestamp': f"{ai_ts}_ai", 'userId': user_id, 'sender': 'ai', 'text': ai_response_text})

    return {"text": ai_response_text, "conversationId": conv_id}