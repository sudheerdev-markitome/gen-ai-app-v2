# main.py
import os
import requests
import boto3
from datetime import datetime, timezone
import uuid
from typing import List, Optional
import json
import asyncio
import shutil
import subprocess # Keep for now if you still want the upload endpoint, remove otherwise

from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File # Keep UploadFile/File if keeping upload
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import jwt, jwk
from jose.exceptions import JOSEError
from sse_starlette.sse import EventSourceResponse
import boto3.dynamodb.conditions

import openai
import google.generativeai as genai

## -------------------
## CONFIGURATION
## -------------------
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")

dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
chat_history_table = dynamodb.Table('ChatHistory')

SUPPORTED_MODELS = {
    "gpt-4o": { "type": "openai", "name": "gpt-4o" },
    "gpt-4": { "type": "openai", "name": "gpt-4" },
    "gemini-pro": { "type": "google", "name": "gemini-1.5-pro-latest" },
    "gemini-2.5-flash": { "type": "google", "name": "gemini-1.5-flash" }
}

KNOWLEDGE_BASE_DIR = "knowledge_base" # Keep if keeping upload endpoint

## -------------------
## AUTHENTICATION
## -------------------
COGNITO_JWKS_URL = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

try:
    response = requests.get(COGNITO_JWKS_URL)
    response.raise_for_status()
    jwks = response.json()
except requests.exceptions.RequestException as e:
    raise RuntimeError(f"Could not fetch Cognito JWKS: {e}")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"], "kid": key["kid"], "use": key["use"],
                    "n": key["n"], "e": key["e"]
                }
        if rsa_key:
            payload = jwt.decode(
                token, rsa_key, algorithms=["RS256"],
                audience=COGNITO_APP_CLIENT_ID,
                issuer=f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
            )
            return payload
    except JOSEError:
        raise credentials_exception
    raise credentials_exception

## -------------------
## PYDANTIC MODELS
## -------------------
class ChatMessage(BaseModel):
    role: str
    content: str

class PromptRequest(BaseModel):
    prompt: str
    model: str
    conversationId: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    image: Optional[str] = None

## -------------------
## FASTAPI APP
## -------------------
app = FastAPI()

## -------------------
## STREAMING LOGIC (Simplified - No RAG)
## -------------------
async def stream_generator(request_data: dict):
    user_prompt = request_data.get("prompt")
    model_name = request_data.get("model")
    history = request_data.get("history", [])
    image_b64 = request_data.get("image")
    conversation_id = request_data.get("conversationId") or str(uuid.uuid4())
    user_id = request_data.get("userId")

    # Use original prompt or default if image provided without text
    display_prompt = user_prompt or ("What's in this image?" if image_b64 else "...") # Use original prompt

    # 1. Save user's prompt to DB
    timestamp = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={
        'conversationId': conversation_id, 'timestamp': f"{timestamp}_user",
        'userId': user_id, 'sender': 'user', 'text': display_prompt
    })

    model_config = SUPPORTED_MODELS.get(model_name)
    if not model_config:
        yield json.dumps({"error": "Model not supported"})
        return

    full_response = ""
    try:
        if model_config["type"] == "openai":
            messages_for_api = []
            if history:
                for msg in history:
                    role = "assistant" if msg['role'] == "model" else msg['role']
                    messages_for_api.append({"role": role, "content": msg['content']})

            user_content = []
            # Use the original user prompt (or default)
            user_content.append({"type": "text", "text": display_prompt})

            if image_b64:
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": image_b64}
                })

            messages_for_api.append({"role": "user", "content": user_content})

            stream = openai.chat.completions.create(
                model=model_config["name"],
                messages=messages_for_api,
                stream=True,
                max_tokens=1500
            )

            for chunk in stream:
                content = chunk.choices[0].delta.content or ""
                if content:
                    full_response += content
                    yield json.dumps({"text": content})
                    await asyncio.sleep(0.01)

        elif model_config["type"] == "google":
            model = genai.GenerativeModel(model_config["name"])
            # Note: Add multimodal handling for Gemini here if needed
            stream = model.generate_content(display_prompt, stream=True)
            for chunk in stream:
                content = chunk.text
                full_response += content
                yield json.dumps({"text": content})
                await asyncio.sleep(0.01)

    except Exception as e:
        yield json.dumps({"error": f"Error from AI service: {str(e)}"})
        return

    # 2. After stream, save the full AI response to DB
    ai_timestamp = datetime.now(timezone.utc).isoformat()
    chat_history_table.put_item(Item={
        'conversationId': conversation_id, 'timestamp': f"{ai_timestamp}_ai",
        'userId': user_id, 'sender': 'ai', 'text': full_response
    })

    # 3. Send final "done" event
    yield json.dumps({"event": "done", "conversationId": conversation_id})

## -------------------
## API ENDPOINTS
## -------------------
@app.get("/api/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(user_id)
        )
        conversations = {}
        for item in sorted(response.get('Items', []), key=lambda x: x['timestamp'], reverse=True):
            conv_id = item['conversationId']
            if conv_id not in conversations:
                title_text = item.get('text', 'New Chat')[:50]
                conversations[conv_id] = {'id': conv_id, 'title': title_text}
        return sorted(list(conversations.values()), key=lambda x: x['title'])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id)
        )
        items = response.get('Items', [])
        if items and items[0].get('userId') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    try:
        response = chat_history_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('conversationId').eq(conversation_id)
        )
        items = response.get('Items', [])
        if not items:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if items[0].get('userId') != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        with chat_history_table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'conversationId': item['conversationId'],'timestamp': item['timestamp']})
        print(f"Deleted {len(items)} items for conversation {conversation_id}")
        return {"detail": f"Conversation {conversation_id} deleted successfully."}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"Error deleting conversation {conversation_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error while deleting conversation: {str(e)}")

@app.post("/api/generate")
async def generate_text_stream(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    request_data = request.model_dump()
    request_data["userId"] = current_user.get("sub")
    return EventSourceResponse(stream_generator(request_data))