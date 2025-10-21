# ingest.py
import os
from langchain.document_loaders import DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain.vectorstores import Chroma
import chromadb
from dotenv import load_dotenv

# Load environment variables (for OPENAI_API_KEY)
load_dotenv()

# --- Configuration ---
KNOWLEDGE_BASE_DIR = "knowledge_base"
# Point this to your server's IP where ChromaDB will be running
CHROMA_HOST = "your-server-ip" 
CHROMA_PORT = 8001
COLLECTION_NAME = "marketing_docs"

def main():
    print("--- Starting document ingestion ---")

    # 1. Load documents from the directory
    loader = DirectoryLoader(KNOWLEDGE_BASE_DIR)
    documents = loader.load()
    if not documents:
        print("No documents found in the knowledge_base directory.")
        return
    print(f"Loaded {len(documents)} document(s).")

    # 2. Split documents into smaller chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    texts = text_splitter.split_documents(documents)
    print(f"Split documents into {len(texts)} chunks.")

    # 3. Create OpenAI embeddings
    embeddings = OpenAIEmbeddings()

    # 4. Connect to ChromaDB and store the documents
    # This connects to the ChromaDB container running on your server
    chroma_client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
    
    print(f"Storing chunks in ChromaDB collection: {COLLECTION_NAME}...")
    Chroma.from_documents(
        texts, 
        embeddings, 
        collection_name=COLLECTION_NAME, 
        client=chroma_client
    )
    
    print("--- Ingestion complete! ---")

if __name__ == "__main__":
    main()