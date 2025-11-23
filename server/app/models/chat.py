# app/models/chat.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from bson import ObjectId


class MessageIn(BaseModel):
    content: str
    message_type: str = Field(..., description="text, voice, image")
    file_data: Optional[Dict[str, Any]] = None  # For storing file metadata
    mode_data: Optional[Dict[str, Any]] = None  # For storing transcription, etc.

class MessageOut(BaseModel):
    id: str
    session_id: str
    content: str
    message_type: str
    is_user: bool
    file_data: Optional[Dict[str, Any]] = None
    mode_data: Optional[Dict[str, Any]] = None
    timestamp: datetime
    context_used: Optional[Dict[str, Any]] = None  # RAG context info
    response_metadata: Optional[Dict[str, Any]] = None  # LLM response metadata

class ChatSessionIn(BaseModel):
    title: Optional[str] = None
    
class ChatSessionOut(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None

class ConversationMemory(BaseModel):
    """Store conversation context for memory functionality"""
    session_id: str
    user_preferences: Dict[str, Any] = Field(default_factory=dict)
    conversation_context: List[Dict[str, Any]] = Field(default_factory=list)
    key_topics: List[str] = Field(default_factory=list)
    user_goals: List[str] = Field(default_factory=list)
    fitness_profile: Dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime

class ChatHistoryResponse(BaseModel):
    sessions: List[ChatSessionOut]
    total_sessions: int
    current_page: int
    total_pages: int

class SessionMessagesResponse(BaseModel):
    session: ChatSessionOut
    messages: List[MessageOut]
    conversation_memory: Optional[ConversationMemory] = None
