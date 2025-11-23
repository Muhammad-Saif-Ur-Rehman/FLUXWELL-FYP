# app/services/chat_service.py
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import json

from app.database.connection import db
from app.models.chat import (
    MessageIn, MessageOut, ChatSessionIn, ChatSessionOut, 
    ConversationMemory, ChatHistoryResponse, SessionMessagesResponse
)

# Collections
chat_sessions = db.chat_sessions
chat_messages = db.chat_messages
conversation_memory = db.conversation_memory

class ChatService:
    
    @staticmethod
    async def create_session(user_id: str, title: Optional[str] = None) -> ChatSessionOut:
        """Create a new chat session"""
        if not title:
            # Generate title based on current time
            title = f"Chat {datetime.now().strftime('%m/%d %H:%M')}"
        
        session_doc = {
            "user_id": user_id,
            "title": title,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "message_count": 0,
            "last_message": None,
            "last_message_time": None
        }
        
        result = chat_sessions.insert_one(session_doc)
        session_doc["_id"] = result.inserted_id
        
        return ChatSessionOut(
            id=str(session_doc["_id"]),
            user_id=session_doc["user_id"],
            title=session_doc["title"],
            created_at=session_doc["created_at"],
            updated_at=session_doc["updated_at"],
            message_count=session_doc["message_count"],
            last_message=session_doc["last_message"],
            last_message_time=session_doc["last_message_time"]
        )
    
    @staticmethod
    async def get_user_sessions(
        user_id: str, 
        page: int = 1, 
        limit: int = 20,
        search: Optional[str] = None
    ) -> ChatHistoryResponse:
        """Get user's chat sessions with pagination"""
        skip = (page - 1) * limit
        
        # Build query
        query = {"user_id": user_id}
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"last_message": {"$regex": search, "$options": "i"}}
            ]
        
        # Get total count
        total_sessions = chat_sessions.count_documents(query)
        total_pages = max(1, (total_sessions + limit - 1) // limit)
        
        # Get sessions
        cursor = chat_sessions.find(query).sort("updated_at", -1).skip(skip).limit(limit)
        sessions = []
        
        for doc in cursor:
            sessions.append(ChatSessionOut(
                id=str(doc["_id"]),
                user_id=doc["user_id"],
                title=doc["title"],
                created_at=doc["created_at"],
                updated_at=doc["updated_at"],
                message_count=doc.get("message_count", 0),
                last_message=doc.get("last_message"),
                last_message_time=doc.get("last_message_time")
            ))
        
        return ChatHistoryResponse(
            sessions=sessions,
            total_sessions=total_sessions,
            current_page=page,
            total_pages=total_pages
        )
    
    @staticmethod
    async def get_session_messages(
        session_id: str, 
        user_id: str,
        page: int = 1,
        limit: int = 50
    ) -> SessionMessagesResponse:
        """Get messages for a specific session"""
        # Verify session belongs to user
        session_doc = chat_sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": user_id
        })
        
        if not session_doc:
            raise ValueError("Session not found or access denied")
        
        session = ChatSessionOut(
            id=str(session_doc["_id"]),
            user_id=session_doc["user_id"],
            title=session_doc["title"],
            created_at=session_doc["created_at"],
            updated_at=session_doc["updated_at"],
            message_count=session_doc.get("message_count", 0),
            last_message=session_doc.get("last_message"),
            last_message_time=session_doc.get("last_message_time")
        )
        
        # Get messages with pagination
        skip = (page - 1) * limit
        cursor = chat_messages.find({
            "session_id": session_id
        }).sort("timestamp", 1).skip(skip).limit(limit)
        
        messages = []
        for doc in cursor:
            messages.append(MessageOut(
                id=str(doc["_id"]),
                session_id=doc["session_id"],
                content=doc["content"],
                message_type=doc["message_type"],
                is_user=doc["is_user"],
                file_data=doc.get("file_data"),
                mode_data=doc.get("mode_data"),
                timestamp=doc["timestamp"],
                context_used=doc.get("context_used"),
                response_metadata=doc.get("response_metadata")
            ))
        
        # Get conversation memory
        memory_doc = conversation_memory.find_one({"session_id": session_id})
        memory = None
        if memory_doc:
            memory = ConversationMemory(
                session_id=memory_doc["session_id"],
                user_preferences=memory_doc.get("user_preferences", {}),
                conversation_context=memory_doc.get("conversation_context", []),
                key_topics=memory_doc.get("key_topics", []),
                user_goals=memory_doc.get("user_goals", []),
                fitness_profile=memory_doc.get("fitness_profile", {}),
                updated_at=memory_doc["updated_at"]
            )
        
        return SessionMessagesResponse(
            session=session,
            messages=messages,
            conversation_memory=memory
        )
    
    @staticmethod
    async def add_message(
        session_id: str,
        user_id: str,
        content: str,
        message_type: str,
        is_user: bool,
        file_data: Optional[Dict[str, Any]] = None,
        mode_data: Optional[Dict[str, Any]] = None,
        context_used: Optional[Dict[str, Any]] = None,
        response_metadata: Optional[Dict[str, Any]] = None
    ) -> MessageOut:
        """Add a message to a session"""
        # Verify session belongs to user
        session_doc = chat_sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": user_id
        })
        
        if not session_doc:
            raise ValueError("Session not found or access denied")
        
        # Create message
        message_doc = {
            "session_id": session_id,
            "content": content,
            "message_type": message_type,
            "is_user": is_user,
            "file_data": file_data,
            "mode_data": mode_data,
            "timestamp": datetime.now(timezone.utc),
            "context_used": context_used,
            "response_metadata": response_metadata
        }
        
        result = chat_messages.insert_one(message_doc)
        message_doc["_id"] = result.inserted_id
        
        # Update session stats
        update_data = {
            "$set": {
                "updated_at": datetime.now(timezone.utc),
            },
            "$inc": {"message_count": 1}
        }
        
        if is_user:
            update_data["$set"]["last_message"] = content[:100] + "..." if len(content) > 100 else content
            update_data["$set"]["last_message_time"] = datetime.now(timezone.utc)
        
        chat_sessions.update_one(
            {"_id": ObjectId(session_id)},
            update_data
        )
        
        return MessageOut(
            id=str(message_doc["_id"]),
            session_id=message_doc["session_id"],
            content=message_doc["content"],
            message_type=message_doc["message_type"],
            is_user=message_doc["is_user"],
            file_data=message_doc.get("file_data"),
            mode_data=message_doc.get("mode_data"),
            timestamp=message_doc["timestamp"],
            context_used=message_doc.get("context_used"),
            response_metadata=message_doc.get("response_metadata")
        )
    
    @staticmethod
    async def update_conversation_memory(
        session_id: str,
        user_preferences: Optional[Dict[str, Any]] = None,
        conversation_context: Optional[List[Dict[str, Any]]] = None,
        key_topics: Optional[List[str]] = None,
        user_goals: Optional[List[str]] = None,
        fitness_profile: Optional[Dict[str, Any]] = None
    ) -> ConversationMemory:
        """Update or create conversation memory for a session"""
        
        # Prepare update data
        update_data = {
            "session_id": session_id,
            "updated_at": datetime.now(timezone.utc)
        }
        
        if user_preferences is not None:
            update_data["user_preferences"] = user_preferences
        if conversation_context is not None:
            # Keep only last 10 context items to prevent memory bloat
            update_data["conversation_context"] = conversation_context[-10:]
        if key_topics is not None:
            # Keep only last 20 topics
            update_data["key_topics"] = list(set(key_topics))[-20:]
        if user_goals is not None:
            update_data["user_goals"] = user_goals
        if fitness_profile is not None:
            update_data["fitness_profile"] = fitness_profile
        
        # Upsert conversation memory
        result = conversation_memory.update_one(
            {"session_id": session_id},
            {"$set": update_data},
            upsert=True
        )
        
        # Get updated document
        memory_doc = conversation_memory.find_one({"session_id": session_id})
        
        return ConversationMemory(
            session_id=memory_doc["session_id"],
            user_preferences=memory_doc.get("user_preferences", {}),
            conversation_context=memory_doc.get("conversation_context", []),
            key_topics=memory_doc.get("key_topics", []),
            user_goals=memory_doc.get("user_goals", []),
            fitness_profile=memory_doc.get("fitness_profile", {}),
            updated_at=memory_doc["updated_at"]
        )
    
    @staticmethod
    async def get_conversation_memory(session_id: str) -> Optional[ConversationMemory]:
        """Get conversation memory for a session"""
        memory_doc = conversation_memory.find_one({"session_id": session_id})
        
        if not memory_doc:
            return None
        
        return ConversationMemory(
            session_id=memory_doc["session_id"],
            user_preferences=memory_doc.get("user_preferences", {}),
            conversation_context=memory_doc.get("conversation_context", []),
            key_topics=memory_doc.get("key_topics", []),
            user_goals=memory_doc.get("user_goals", []),
            fitness_profile=memory_doc.get("fitness_profile", {}),
            updated_at=memory_doc["updated_at"]
        )
    
    @staticmethod
    async def delete_session(session_id: str, user_id: str) -> bool:
        """Delete a chat session and all its messages"""
        # Verify ownership
        session_doc = chat_sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": user_id
        })
        
        if not session_doc:
            return False
        
        # Delete messages
        chat_messages.delete_many({"session_id": session_id})
        
        # Delete memory
        conversation_memory.delete_one({"session_id": session_id})
        
        # Delete session
        result = chat_sessions.delete_one({"_id": ObjectId(session_id)})
        
        return result.deleted_count > 0
    
    @staticmethod
    async def update_session_title(session_id: str, user_id: str, title: str) -> bool:
        """Update session title"""
        result = chat_sessions.update_one(
            {"_id": ObjectId(session_id), "user_id": user_id},
            {"$set": {"title": title, "updated_at": datetime.utcnow()}}
        )
        
        return result.modified_count > 0
