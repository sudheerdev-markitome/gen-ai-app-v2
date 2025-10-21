# main.py
import os
import requests
import boto3
from datetime import datetime, timezone
import uuid
from typing import List, Optional
import json
import asyncio

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
import shutil
import subprocess # To run the ingest script
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from dotenv import load_dotenv
from jose import jwt, jwk
from jose.exceptions import JOSEError
from sse_starlette.sse import EventSourceResponse

import openai
import google.generativeai as genai
import chromadb
from langchain_openai import OpenAIEmbeddings

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
## RAG CONFIGURATION (ChromaDB)
## -------------------
CHROMA_HOST = "chromadb" # Docker service name for internal communication
CHROMA_PORT = 8000
COLLECTION_NAME = "marketing_docs"
embeddings = OpenAIEmbeddings()
chroma_client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
collection = chroma_client.get_or_create_collection(name=COLLECTION_NAME)

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
## STREAMING LOGIC
## -------------------
async def stream_generator(request_data: dict):
    user_prompt = request_data.get("prompt")
    model_name = request_data.get("model")
    history = request_data.get("history", [])
    image_b64 = request_data.get("image")
    conversation_id = request_data.get("conversationId") or str(uuid.uuid4())
    user_id = request_data.get("userId")
    
    display_prompt = user_prompt or "What's in this image?"

    # --- RAG QUERY STEP ---
    # Only perform RAG if there's a text prompt and no image
    rag_prompt = user_prompt
    if user_prompt and not image_b64:
        try:
            results = collection.query(
                query_texts=[user_prompt],
                n_results=3
            )
            context = "\n\n".join(results['documents'][0])
            
            rag_prompt = (
                f"Based on the following context, please provide a detailed answer to the user's question.\n\n"
                f"Context:\n{context}\n\n"
                f"User Question: {user_prompt}"
            )
        except Exception as e:
            print(f"RAG query failed: {e}")
            # Fallback to the original prompt if RAG fails
            rag_prompt = user_prompt
    # -----------------------

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
            # Use the RAG-enhanced prompt for the text part
            user_content.append({"type": "text", "text": rag_prompt})
            
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
            stream = model.generate_content(rag_prompt, stream=True)
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
                conversations[conv_id] = {'id': conv_id, 'title': item['text'][:50]}
        return list(conversations.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# --- NEW ENDPOINT FOR FILE UPLOAD ---
KNOWLEDGE_BASE_DIR = "knowledge_base"

@app.post("/api/upload-knowledge")
async def upload_knowledge_document(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    # Ensure the knowledge_base directory exists
    os.makedirs(KNOWLEDGE_BASE_DIR, exist_ok=True)
    
    # Define the path to save the file
    file_path = os.path.join(KNOWLEDGE_BASE_DIR, file.filename)
    
    # Save the uploaded file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
    finally:
        file.file.close()

    # --- Option A: Trigger ingestion immediately (simpler for now) ---
    try:
        print(f"Running ingestion for {file.filename}...")
        # Note: Ensure the venv Python is accessible or use absolute path
        # Using sys.executable ensures we use the Python from the running process (Uvicorn/Docker)
        python_executable = "/usr/local/bin/python" # Path inside Docker container
        result = subprocess.run([python_executable, "ingest.py"], capture_output=True, text=True, check=True)
        print("Ingestion script output:", result.stdout)
        if result.stderr:
            print("Ingestion script error:", result.stderr)

    except subprocess.CalledProcessError as e:
         print(f"Ingestion script failed: {e}")
         # Decide if you want to raise an HTTP error or just log it
         # raise HTTPException(status_code=500, detail=f"File saved, but ingestion failed: {e.stderr}")
    except Exception as e:
         print(f"An unexpected error occurred during ingestion: {e}")
         # raise HTTPException(status_code=500, detail=f"File saved, but ingestion encountered an error: {str(e)}")


    return {"filename": file.filename, "detail": "File uploaded and ingestion triggered."}

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

@app.post("/api/generate")
async def generate_text_stream(request: PromptRequest, current_user: dict = Depends(get_current_user)):
    request_data = request.model_dump()
    request_data["userId"] = current_user.get("sub")
    
    return EventSourceResponse(stream_generator(request_data))

