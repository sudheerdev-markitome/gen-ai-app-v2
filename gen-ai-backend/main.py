# main.py
import os
import requests
import boto3
import boto3.dynamodb.conditions
from datetime import datetime, timezone
import uuid
from typing import List, Optional
import json

from fastapi import FastAPI, Depends, HTTPException, status, Request
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

# Make sure these are set in your .env file
COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")

dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
chat_history_table = dynamodb.Table('ChatHistory')

# Ensure you have a vision model like gpt-4o
SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai", "name": "gpt-4o" },
    "gpt-4": { "type": "openai", "name": "gpt-4" },
    "gemini-pro": { "type": "google", "name": "gemini-1.5-pro-latest" },
    "gemini-2.5-flash": { "type": "google", "name": "gemini-1.5-flash" }
}

## -------------------
## PYDANTIC MODELS (Corrected - No Duplicates)
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
    except jwt.ExpiredSignatureError:
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.JWTClaimsError as e:
         print(f"JWT Claims Error: {e}")
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid claims: {e}")
    except Exception as e:
         print(f"Unexpected token validation error: {e}")
         raise credentials_exception

## -------------------
## FASTAPI APP
## -------------------
app = FastAPI()

## -------------------
## API ENDPOINTS
## -------------------
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
            if conv_id not in items_by_conv:
                items_by_conv[conv_id] = []
            items_by_conv[conv_id].append(item)

        conversations = []
        for conv_id, items in items_by_conv.items():
            items.sort(key=lambda x: x['timestamp'])
            first_message = items[0]
            display_title = first_message.get('title', None) 
            if not display_title:
                 display_title = first_message.get('text', 'New Chat')[:50]
            conversations.append({'id': conv_id, 'title': display_title})

        return sorted(list(conversations.values()), key=lambda x: x['title'])
    except Exception as e:
        print(f"Error getting conversations for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="User ID not found in token")
    try:
        response = chat_history_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id)
        )
        items = response.get('Items', [])
        if items and items[0].get('userId') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        items.sort(key=lambda x: x['timestamp'])
        return items
    except Exception as e:
        print(f"Error getting messages for conv {conversation_id}, user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="User ID not found in token")

    try:
        response = chat_history_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id)
        )
        items = response.get('Items', [])
        if not items:
            return {"detail": f"Conversation {conversation_id} not found or already deleted."}
        if items[0].get('userId') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        with chat_history_table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'conversationId': item['conversationId'],'timestamp': item['timestamp']})
        print(f"Deleted {len(items)} items for conversation {conversation_id}")
        return {"detail": f"Conversation {conversation_id} deleted successfully."}
    except Exception as e:
        print(f"Error deleting conversation {conversation_id} for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error while deleting conversation: {str(e)}")

@app.put("/api/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, request: RenameRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    new_title = request.new_title.strip()

    if not new_title:
        raise HTTPException(status_code=400, detail="New title cannot be empty")
    if len(new_title) > 100:
        raise HTTPException(status_code=400, detail="Title cannot exceed 100 characters")

    try:
        response = chat_history_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id),
            ScanIndexForward=True
        )
        items = response.get('Items', [])
        if not items:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if items[0].get('userId') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        first_message_timestamp = items[0]['timestamp']
        chat_history_table.update_item(
            Key={
                'conversationId': conversation_id,
                'timestamp': first_message_timestamp
            },
            UpdateExpression="SET title = :t",
            ExpressionAttributeValues={ ':t': new_title }
        )
        print(f"Renamed conversation {conversation_id} to '{new_title}'")
        return {"id": conversation_id, "title": new_title}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"Error renaming conversation {conversation_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error while renaming conversation: {str(e)}")

# Non-streaming version of the generate endpoint
@app.post("/api/generate")
async def generate_text_sync(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="User ID not found in token")

    conversation_id = request.conversationId or str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    display_prompt = request.prompt or ("Image Received" if request.image else "...")
    final_prompt_for_llm = request.prompt or ("Describe this image." if request.image else "")
    if not final_prompt_for_llm:
         raise HTTPException(status_code=400, detail="Prompt cannot be empty unless an image is provided.")

    try:
        chat_history_table.put_item(Item={
            'conversationId': conversation_id, 'timestamp': f"{timestamp}_user",
            'userId': user_id, 'sender': 'user', 'text': display_prompt
        })
    except Exception as e:
         print(f"Error saving user message to DynamoDB: {str(e)}")
         # Continue anyway, but this is a problem
         # raise HTTPException(status_code=500, detail="Failed to save user message")

    model_config = SUPPORTED_MODELS.get(request.model)
    if not model_config:
        raise HTTPException(status_code=400, detail="Model not supported")

    ai_response_text = ""
    try:
        if model_config["type"] == "openai":
            messages_for_api = []
            
            # --- CORRECTED LOGIC ---
            # 1. Add System Prompt (if it exists)
            if request.systemPrompt and request.systemPrompt.strip():
                messages_for_api.append({"role": "system", "content": request.systemPrompt.strip()})
            
            # 2. Add History
            if request.history:
                for msg in request.history:
                    role = "assistant" if msg.role == "model" else msg.role
                    messages_for_api.append({"role": role, "content": msg.content})

            # 3. Add current user message (text and image)
            user_content = []
            user_content.append({"type": "text", "text": final_prompt_for_llm})
            if request.image:
                user_content.append({"type": "image_url", "image_url": {"url": request.image}})
            messages_for_api.append({"role": "user", "content": user_content})
            # --- END OF CORRECTED LOGIC ---

            response = openai.chat.completions.create(
                model=model_config["name"],
                messages=messages_for_api,
                max_tokens=1500
            )
            ai_response_text = response.choices[0].message.content or ""

        elif model_config["type"] == "google":
            # Note: Gemini system prompt requires different handling
            # This is a simplified call
            model = genai.GenerativeModel(model_config["name"])
            response = model.generate_content(final_prompt_for_llm)
            ai_response_text = response.text

    except Exception as e:
        print(f"Error calling AI service ({model_config.get('type')}): {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error from AI service: {str(e)}")

    ai_timestamp = datetime.now(timezone.utc).isoformat()
    try:
        chat_history_table.put_item(Item={
            'conversationId': conversation_id, 'timestamp': f"{ai_timestamp}_ai",
            'userId': user_id, 'sender': 'ai', 'text': ai_response_text
        })
    except Exception as e:
         print(f"Error saving AI message to DynamoDB: {str(e)}")
         # Don't fail the request, just log the save error
    
    return {"text": ai_response_text, "conversationId": conversation_id}