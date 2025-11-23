from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME")

# Initialize database connection with error handling
try:
    if not MONGO_URI:
        raise ValueError("MONGODB_URI environment variable not set")
    if not DB_NAME:
        raise ValueError("DB_NAME environment variable not set")
    
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    
    # Test connection
    client.admin.command('ping')
    print(f"Database connection successful: {DB_NAME}")
except Exception as e:
    print(f"Warning: Database connection failed: {e}")
    client = None
    db = None