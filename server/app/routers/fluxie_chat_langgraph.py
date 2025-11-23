# fluxie_chat_langgraph.py - LangGraph Enhanced Chat Router
import os
import json
import tempfile
import base64
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any

from groq import AsyncGroq
from dotenv import load_dotenv

from app.services.langgraph_chat_service import langgraph_chat_service
from app.services.chat_service import ChatService
from app.services.memory_service import MemoryService
from app.models.chat import (
    ChatSessionIn, ChatSessionOut, ChatHistoryResponse, 
    SessionMessagesResponse, MessageIn
)
from app.auth.jwt_auth import get_current_user_id

load_dotenv()

# --------------------
# Config
# --------------------
router = APIRouter(prefix="/fluxie", tags=["Fluxie Chat - LangGraph"])

groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# --------------------
# Chat History Management Routes
# --------------------

@router.post("/sessions", response_model=ChatSessionOut)
async def create_chat_session(
    session_data: ChatSessionIn,
    user_id: str = Depends(get_current_user_id)
):
    """Create a new chat session"""
    try:
        session = await ChatService.create_session(
            user_id=user_id,
            title=session_data.title
        )
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@router.get("/sessions", response_model=ChatHistoryResponse)
async def get_chat_history(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in titles and messages"),
    user_id: str = Depends(get_current_user_id)
):
    """Get user's chat history with pagination and search"""
    try:
        history = await ChatService.get_user_sessions(
            user_id=user_id,
            page=page,
            limit=limit,
            search=search
        )
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chat history: {str(e)}")

@router.get("/sessions/{session_id}", response_model=SessionMessagesResponse)
async def get_session_messages(
    session_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Messages per page"),
    user_id: str = Depends(get_current_user_id)
):
    """Get messages for a specific chat session"""
    try:
        session_data = await ChatService.get_session_messages(
            session_id=session_id,
            user_id=user_id,
            page=page,
            limit=limit
        )
        return session_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session messages: {str(e)}")

@router.put("/sessions/{session_id}/title")
async def update_session_title(
    session_id: str,
    title: str = Form(...),
    user_id: str = Depends(get_current_user_id)
):
    """Update session title"""
    try:
        success = await ChatService.update_session_title(
            session_id=session_id, 
            user_id=user_id, 
            title=title
        )
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"success": True, "message": "Title updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update title: {str(e)}")

@router.delete("/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a chat session and all its messages"""
    try:
        success = await ChatService.delete_session(
            session_id=session_id,
            user_id=user_id
        )
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"success": True, "message": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")

# --------------------
# LangGraph Enhanced Chat Route
# --------------------
@router.post("/chat")
async def chat_with_fluxie_langgraph(
    user_message: Optional[str] = Form(None),
    mode: str = Form("text"),  # "text", "voice", "image"
    style: str = Form("friendly"),
    session_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user_id)
):
    """LangGraph-powered chat with advanced state management and memory"""
    
    try:
        # Handle file processing if present
        file_data = None
        processed_message = user_message or ""
        
        if file and mode == "voice":
            # Handle voice file
            file_content = await file.read()
            if len(file_content) == 0:
                return {"error": "Audio file is empty"}
            
            # Create temp file for Whisper processing
            file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'wav'
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as temp_file:
                temp_file.write(file_content)
                audio_path = temp_file.name
            
            try:
                # Transcribe using Whisper
                with open(audio_path, "rb") as audio_file:
                    transcript = await groq_client.audio.transcriptions.create(
                        model="whisper-large-v3-turbo",
                        file=audio_file,
                        response_format="verbose_json",
                        language="en",
                        temperature=0.0
                    )
                
                # Extract transcribed text
                if isinstance(transcript, str):
                    processed_message = transcript.strip()
                else:
                    processed_message = transcript.text.strip() if hasattr(transcript, 'text') else str(transcript).strip()
                
                # Clean up transcription artifacts
                processed_message = processed_message.replace("...", ".").replace("  ", " ").strip()
                
                if not processed_message or len(processed_message.strip()) < 2:
                    return {"error": "Could not understand the audio. Please try speaking more clearly."}
                
                file_data = {
                    "name": file.filename,
                    "type": file.content_type,
                    "transcription": processed_message,
                    "transcription_confidence": "high" if len(processed_message) > 10 else "medium"
                }
                
            except Exception as e:
                return {"error": f"Voice transcription failed: {str(e)}"}
            finally:
                # Clean up temp file
                try:
                    if os.path.exists(audio_path):
                        os.unlink(audio_path)
                except:
                    pass
        
        elif file and mode == "image":
            # Handle image file
            file_content = await file.read()
            img_base64 = base64.b64encode(file_content).decode('utf-8')
            
            file_data = {
                "name": file.filename,
                "type": file.content_type,
                "image_data": img_base64,
                "image_bytes": file_content  # Pass raw bytes for embedding
            }
            
            if not processed_message:
                processed_message = "Analyze this fitness-related image and provide helpful advice."
        
        elif file:
            # Handle other file types
            file_data = {
                "name": file.filename,
                "type": file.content_type,
                "size": len(await file.read()) if hasattr(file, 'size') else 0
            }
        
        # Use LangGraph service for processing
        result = await langgraph_chat_service.chat(
            user_message=processed_message,
            user_id=user_id,
            session_id=session_id,
            mode=mode,
            style=style,
            file_data=file_data
        )
        
        # Generate session title for new sessions
        if not session_id and result.get("session_id") and processed_message:
            try:
                title = await MemoryService.generate_session_title(result["session_id"], processed_message)
                await ChatService.update_session_title(result["session_id"], user_id, title)
            except Exception as e:
                print(f"Failed to generate session title: {e}")
        
        # Add transcription info for voice mode
        if mode == "voice" and file_data and file_data.get("transcription"):
            result["transcription"] = file_data["transcription"]
            result["transcription_confidence"] = file_data.get("transcription_confidence", "medium")
        
        return result
        
    except Exception as e:
        print(f"LangGraph chat error: {e}")
        return {"error": f"Chat processing failed: {str(e)}"}

