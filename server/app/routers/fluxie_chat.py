# fluxie_chat.py - LangGraph Enhanced
import os
import json
import tempfile
import base64
import httpx
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
router = APIRouter(prefix="/fluxie", tags=["Fluxie Chat"])

PINECONE_NAMESPACES = ["fitness", "nutrition"]

groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# --------------------
# Utilities
# --------------------
async def do_web_search(query: str, k: int = 3) -> str:
    """
    Simple DuckDuckGo fallback search (free).
    """
    try:
        url = f"https://api.duckduckgo.com/?q={query}&format=json&no_redirect=1&no_html=1"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
        abstracts = []
        if data.get("AbstractText"):
            abstracts.append(data["AbstractText"])
        if data.get("RelatedTopics"):
            for rt in data["RelatedTopics"][:k]:
                txt = rt.get("Text")
                if txt:
                    abstracts.append(txt)
        return "\n".join(abstracts) if abstracts else "No useful web results found."
    except Exception as e:
        return f"(Web search error: {e})"

def filter_context_by_score(context_passages: List[Dict[str, Any]], score_threshold: float = 0.65) -> List[Dict[str, Any]]:
    """
    Filter context passages based on similarity score threshold.
    Only passages with score >= threshold are considered reliable enough to use.
    """
    if not context_passages:
        return []
    
    # Filter by score threshold
    high_quality_passages = []
    for passage in context_passages:
        score = passage.get("score", 0.0)
        if score >= score_threshold:
            passage_copy = passage.copy()
            passage_copy["quality_tier"] = "high_confidence" if score >= 0.8 else "good_confidence"
            high_quality_passages.append(passage_copy)
            print(f"Using passage with score {score:.3f}: {passage.get('metadata', {}).get('text_snippet', '')[:100]}...")
        else:
            print(f"Skipping low-score passage ({score:.3f}): {passage.get('metadata', {}).get('text_snippet', '')[:100]}...")
    
    return high_quality_passages

async def call_llm(prompt: str, mode: str = "text", style: str = "friendly", has_quality_context: bool = False):
    """
    Enhanced LLM call with score-based context usage.
    mode = "text", "voice", "image"
    style = coaching style (friendly, strict, motivational)
    has_quality_context = whether high-quality context (score >= 0.65) is available
    """
    # Enhanced system message based on mode and context availability
    base_personality = f"""You are Fluxie, an expert AI fitness coach with deep knowledge in exercise science, nutrition, and wellness. Your coaching style is {style}.

CORE PRINCIPLES:
- Provide evidence-based, scientifically accurate advice
- Personalize recommendations when possible
- Prioritize safety and proper form
- Be encouraging and motivational
- Ask clarifying questions when needed"""

    if mode == "voice":
        system_msg = f"""{base_personality}

VOICE INTERACTION GUIDELINES:
- Keep responses conversational and natural
- Use shorter sentences that are easy to understand when spoken
- Be encouraging and supportive
- Ask follow-up questions when appropriate
- Avoid overly technical jargon unless necessary
- Structure answers clearly with numbered points when helpful"""
    else:
        system_msg = f"""{base_personality}

INTERACTION GUIDELINES:
- Provide detailed, well-structured responses
- Use bullet points and formatting for clarity
- Include specific examples and actionable advice
- Reference scientific principles when relevant"""

    # Add context usage instructions based on quality
    if has_quality_context:
        system_msg += f"""

KNOWLEDGE BASE CONTEXT AVAILABLE:
You have access to high-quality, relevant information from our fitness knowledge base (similarity score ≥ 0.65).
- PRIORITIZE the provided context information as it's highly relevant to the user's question
- Use the context as your PRIMARY source for answering
- Supplement with your training knowledge only to enhance or clarify the context
- If context contradicts your training, defer to the context as it's more specific to our knowledge base
- Always acknowledge when you're using knowledge base information vs. general knowledge"""
    else:
        system_msg += f"""

KNOWLEDGE BASE CONTEXT:
No high-quality matches found in our knowledge base (all similarity scores < 0.65).
- Rely on your comprehensive training in fitness, nutrition, and wellness
- Provide expert-level advice based on current best practices
- Use evidence-based recommendations
- Note that you're drawing from general fitness knowledge rather than our specific knowledge base"""
    
    try:
        resp = await groq_client.chat.completions.create(
            model="meta-llama/llama-4-maverick-17b-128e-instruct",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=1024,
            top_p=0.9
        )
        return resp.choices[0].message.content
    except Exception as e:
        print(f"LLM call failed: {e}")
        # Fallback to simpler model
        try:
            resp = await groq_client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt}
                ]
            )
            return resp.choices[0].message.content
        except Exception as fallback_e:
            print(f"Fallback LLM call also failed: {fallback_e}")
            return "I'm having trouble processing your request right now. Please try again in a moment."

def build_quality_context(passages: List[Dict[str, Any]]) -> str:
    """
    Build context from high-quality passages (score >= 0.65) with clear structure.
    """
    if not passages:
        return ""
    
    context_parts = []
    high_confidence = [p for p in passages if p.get("quality_tier") == "high_confidence"]
    good_confidence = [p for p in passages if p.get("quality_tier") == "good_confidence"]
    
    if high_confidence:
        context_parts.append("=== HIGH CONFIDENCE KNOWLEDGE (Score ≥ 0.80) ===")
        for i, passage in enumerate(high_confidence, 1):
            meta = passage.get("metadata") or {}
            text = meta.get("text_snippet") or meta.get("text") or ""
            source = meta.get("source") or passage.get("_namespace") or "knowledge base"
            score = passage.get("score", 0.0)
            
            context_parts.append(f"""
[Source {i}: {source}] (Similarity: {score:.3f})
{text.strip()}
""")
    
    if good_confidence:
        context_parts.append("\n=== GOOD CONFIDENCE KNOWLEDGE (Score 0.65-0.79) ===")
        for i, passage in enumerate(good_confidence, 1):
            meta = passage.get("metadata") or {}
            text = meta.get("text_snippet") or meta.get("text") or ""
            source = meta.get("source") or passage.get("_namespace") or "knowledge base"
            score = passage.get("score", 0.0)
            
            context_parts.append(f"""
[Source {i}: {source}] (Similarity: {score:.3f})
{text.strip()}
""")
    
    return "\n".join(context_parts)

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
                        model="whisper-large-v3",
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

