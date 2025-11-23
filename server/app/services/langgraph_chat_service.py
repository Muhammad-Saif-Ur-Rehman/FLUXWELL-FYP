"""
LangGraph-based Chat Service for Fluxwell
Professional implementation with proper state management, memory, and session handling
"""

import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional, TypedDict, Annotated, Sequence, Union
from datetime import datetime, timedelta
from bson import ObjectId
import time

from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from groq import AsyncGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableConfig

from app.database.connection import db
from app.services.rag_service import retrieve, embed_image_bytes
from app.services.memory_service import MemoryService
from app.models.chat import ChatSessionOut, MessageOut, ConversationMemory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ChatState(TypedDict):
    """Enhanced state for the chat conversation graph"""
    messages: Annotated[Sequence[BaseMessage], "The conversation messages"]
    session_id: str
    user_id: str
    user_message: str
    mode: str  # text, voice, image
    style: str  # friendly, strict, motivational
    file_data: Optional[Dict[str, Any]]
    rag_context: Optional[str]
    memory_context: Optional[str]
    has_quality_context: bool
    conversation_memory: Optional[Dict[str, Any]]
    response_metadata: Dict[str, Any]
    retrieved_matches: List[Dict[str, Any]]
    processing_start_time: float
    error_count: int
    retry_count: int


class LangGraphChatService:
    """Professional LangGraph-based chat service"""
    
    def __init__(self):
        try:
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                raise ValueError("GROQ_API_KEY environment variable is required")
            
            self.groq_client = ChatGroq(
                api_key=api_key,
                model_name="meta-llama/llama-4-maverick-17b-128e-instruct",
                temperature=0.6,  # Reduced for more focused responses
                max_tokens=512,  # Reduced to enforce concise responses (was 1024)
                timeout=30.0,
                max_retries=3
            )
            # Raw Groq client for multimodal calls
            self.raw_groq = AsyncGroq(api_key=api_key)
            
            # Initialize enhanced checkpointer with better memory management
            self.checkpointer = MemorySaver()
            
            # Performance tracking
            self.performance_cache = {}
            self.cache_ttl = 300  # 5 minutes
            
            # Build the conversation graph
            self.graph = self._build_graph()
            
            # Collections
            self.chat_sessions = db.chat_sessions
            self.chat_messages = db.chat_messages
            self.conversation_memory = db.conversation_memory
            
            # Initialize memory optimization
            self._init_memory_optimization()
            
            logger.info("Enhanced LangGraph Chat Service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize LangGraph Chat Service: {e}")
            raise
    
    def _init_memory_optimization(self):
        """Initialize memory optimization features"""
        self.memory_cache = {}
        self.session_cache = {}
        self.last_cleanup = time.time()
    
    def _build_graph(self) -> StateGraph:
        """Build the enhanced LangGraph conversation flow"""
        
        # Define the graph
        workflow = StateGraph(ChatState)
        
        # Add nodes with error handling
        workflow.add_node("initialize_state", self._initialize_state_node)
        workflow.add_node("load_session", self._load_session_node)
        workflow.add_node("load_memory_parallel", self._load_memory_parallel_node)
        workflow.add_node("process_input", self._process_input_node)
        workflow.add_node("retrieve_context_parallel", self._retrieve_context_parallel_node)
        workflow.add_node("generate_response", self._generate_response_node)
        workflow.add_node("save_conversation_parallel", self._save_conversation_parallel_node)
        workflow.add_node("finalize_response", self._finalize_response_node)
        workflow.add_node("error_handler", self._error_handler_node)
        
        # Define the enhanced flow with conditional routing
        workflow.add_edge(START, "initialize_state")
        workflow.add_edge("initialize_state", "load_session")
        workflow.add_edge("load_session", "load_memory_parallel")
        workflow.add_edge("load_memory_parallel", "process_input")
        workflow.add_edge("process_input", "retrieve_context_parallel")
        workflow.add_edge("retrieve_context_parallel", "generate_response")
        workflow.add_edge("generate_response", "save_conversation_parallel")
        workflow.add_edge("save_conversation_parallel", "finalize_response")
        workflow.add_edge("finalize_response", END)
        
        # Error handling edges
        workflow.add_edge("error_handler", "finalize_response")
        
        # Compile the graph with checkpointer
        return workflow.compile(checkpointer=self.checkpointer)
    
    async def _initialize_state_node(self, state: ChatState) -> Dict[str, Any]:
        """Initialize the conversation state with performance tracking"""
        return {
            "processing_start_time": time.time(),
            "error_count": 0,
            "retry_count": 0,
            "retrieved_matches": [],
            "response_metadata": {
                "initialization_time": time.time(),
                "performance_tracking": True
            }
        }
    
    async def _cleanup_cache(self):
        """Clean up expired cache entries"""
        current_time = time.time()
        if current_time - self.last_cleanup > self.cache_ttl:
            # Clean memory cache
            expired_keys = [k for k, v in self.memory_cache.items() 
                          if current_time - v.get('timestamp', 0) > self.cache_ttl]
            for key in expired_keys:
                del self.memory_cache[key]
            
            # Clean session cache
            expired_keys = [k for k, v in self.session_cache.items() 
                          if current_time - v.get('timestamp', 0) > self.cache_ttl]
            for key in expired_keys:
                del self.session_cache[key]
            
            self.last_cleanup = current_time
            logger.info(f"Cache cleanup completed. Memory cache: {len(self.memory_cache)}, Session cache: {len(self.session_cache)}")
    
    async def _load_session_node(self, state: ChatState) -> Dict[str, Any]:
        """Load or create chat session with proper session isolation"""
        session_id = state.get("session_id")
        user_id = state["user_id"]
        
        await self._cleanup_cache()
        
        try:
            if not session_id:
                # Always create a NEW session when session_id is None
                # Do NOT use caching for new session creation to ensure separate chats
                session_doc = {
                    "user_id": user_id,
                    "title": f"Chat {datetime.now().strftime('%m/%d %H:%M')}",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "message_count": 0,
                    "last_message": None,
                    "last_message_time": None
                }
                
                result = self.chat_sessions.insert_one(session_doc)
                session_id = str(result.inserted_id)
                logger.info(f"Created NEW session for separate chat: {session_id}")
                
                # Cache the newly created session with its actual ID
                cache_key = f"{user_id}:{session_id}"
                self.session_cache[cache_key] = {
                    "session_id": session_id,
                    "timestamp": time.time()
                }
                
                return {"session_id": session_id}
            else:
                # For existing sessions, use caching to improve performance
                cache_key = f"{user_id}:{session_id}"
                if cache_key in self.session_cache:
                    cached_session = self.session_cache[cache_key]
                    if time.time() - cached_session['timestamp'] < self.cache_ttl:
                        logger.info(f"Using cached existing session: {cached_session['session_id']}")
                        return {"session_id": cached_session['session_id']}
                
                # Verify existing session
                existing_session = self.chat_sessions.find_one({
                    "_id": ObjectId(session_id),
                    "user_id": user_id
                })
                if not existing_session:
                    logger.warning(f"Session {session_id} not found or access denied for user {user_id}")
                    raise ValueError("Session not found or access denied")
                
                logger.info(f"Loaded existing session: {session_id}")
                
                # Cache the verified existing session
                self.session_cache[cache_key] = {
                    "session_id": session_id,
                    "timestamp": time.time()
                }
                
                return {"session_id": session_id}
            
        except Exception as e:
            logger.error(f"Error in _load_session_node: {e}")
            # Create fallback session
            session_doc = {
                "user_id": user_id,
                "title": f"Recovery Chat {datetime.now().strftime('%m/%d %H:%M')}",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "message_count": 0,
                "last_message": None,
                "last_message_time": None
            }
            
            result = self.chat_sessions.insert_one(session_doc)
            fallback_session_id = str(result.inserted_id)
            logger.info(f"Created fallback session: {fallback_session_id}")
            
            # Cache fallback session
            self.session_cache[cache_key] = {
                "session_id": fallback_session_id,
                "timestamp": time.time()
            }
            
            return {"session_id": fallback_session_id}
    
    async def _load_memory_parallel_node(self, state: ChatState) -> Dict[str, Any]:
        """Load conversation memory with caching and parallel processing"""
        session_id = state["session_id"]
        user_message = state.get("user_message", "").lower().strip()
        
        # Check if this is a simple greeting (don't load profile for greetings)
        greeting_patterns = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'howdy', 'sup', 'yo', 'hiya']
        is_greeting = any(user_message == pattern or user_message.startswith(pattern + ' ') for pattern in greeting_patterns)
        
        # Check cache first
        if session_id in self.memory_cache:
            cached_memory = self.memory_cache[session_id]
            if time.time() - cached_memory['timestamp'] < self.cache_ttl:
                logger.info(f"Using cached memory for session: {session_id}")
                return {
                    "memory_context": cached_memory['memory_context'],
                    "conversation_memory": cached_memory['conversation_memory']
                }
        
        try:
            # Get user_id from state for profile integration
            user_id = state.get("user_id")
            
            # Run memory operations in parallel with user profile integration
            # Skip profile loading for simple greetings to avoid mentioning user data
            memory_tasks = [
                MemoryService.build_memory_context(session_id, user_id, include_profile=not is_greeting),
                asyncio.create_task(self._get_memory_doc_async(session_id))
            ]
            
            memory_context, memory_doc = await asyncio.gather(*memory_tasks, return_exceptions=True)
            
            # Handle exceptions
            if isinstance(memory_context, Exception):
                logger.error(f"Memory context loading failed: {memory_context}")
                memory_context = None
            
            if isinstance(memory_doc, Exception):
                logger.error(f"Memory doc loading failed: {memory_doc}")
                memory_doc = None
            
            conversation_memory = None
            if memory_doc:
                conversation_memory = {
                    "user_preferences": memory_doc.get("user_preferences", {}),
                    "fitness_profile": memory_doc.get("fitness_profile", {}),
                    "key_topics": memory_doc.get("key_topics", []),
                    "user_goals": memory_doc.get("user_goals", []),
                    "conversation_context": memory_doc.get("conversation_context", [])
                }
            
            # Cache the results
            self.memory_cache[session_id] = {
                "memory_context": memory_context,
                "conversation_memory": conversation_memory,
                "timestamp": time.time()
            }
            
            logger.info(f"Loaded memory context: {memory_context[:100] if memory_context else 'None'}")
            
            return {
                "memory_context": memory_context,
                "conversation_memory": conversation_memory
            }
            
        except Exception as e:
            logger.error(f"Error loading memory: {e}")
            return {"memory_context": None, "conversation_memory": None}
    
    async def _get_memory_doc_async(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Async wrapper for memory document retrieval"""
        return self.conversation_memory.find_one({"session_id": session_id})
    
    async def _process_input_node(self, state: ChatState) -> Dict[str, Any]:
        """Process user input based on mode"""
        mode = state.get("mode", "text")
        user_message = state.get("user_message", "")
        file_data = state.get("file_data")
        
        processed_message = user_message
        
        if mode == "voice" and file_data:
            # Voice processing would happen here
            # For now, we'll assume transcription is already done
            processed_message = user_message or "Voice message processed"
        
        elif mode == "image" and file_data:
            # Image processing with embedding (no vector DB retrieval)
            logger.info("Processing image via HF_IMAGE_SPACE embedding (no DB retrieval)")
            processed_message = user_message or "Analyze this fitness-related image and provide helpful advice."
            
            # Get image data and embed it (for feature extraction/validation only)
            try:
                if file_data.get("image_bytes"):
                    # Use raw bytes if available
                    image_bytes = file_data["image_bytes"]
                elif file_data.get("image_data"):
                    # Decode base64 if that's what we have
                    import base64
                    image_bytes = base64.b64decode(file_data["image_data"])
                else:
                    logger.warning("No image data found in file_data")
                    image_bytes = None
                
                if image_bytes:
                    # Embed image using HF_IMAGE_SPACE (no further retrieval)
                    logger.info(f"Embedding image of size {len(image_bytes)} bytes")
                    _ = embed_image_bytes(image_bytes)
                    logger.info("Image embedding completed (no vector search performed)")
                        
            except Exception as e:
                logger.error(f"Error processing image embedding: {e}")
                # Continue without image context
        
        # Create human message
        human_msg = HumanMessage(content=processed_message)
        
        result = {
            "user_message": processed_message,
            "messages": [human_msg]
        }
        return result
    
    async def _retrieve_context_parallel_node(self, state: ChatState) -> Dict[str, Any]:
        """Retrieve RAG context with parallel processing and enhanced error handling"""
        user_message = state["user_message"]
        mode = state.get("mode", "text")
        
        rag_context = ""
        has_quality_context = False
        retrieved_matches = []
        
        if mode in ["text", "voice"] and user_message:
            try:
                # Create retrieval tasks for parallel execution
                retrieval_tasks = []
                namespaces = ["fitness", "nutrition"]
                
                # Run retrieval for each namespace in parallel
                for namespace in namespaces:
                    task = asyncio.create_task(
                        self._retrieve_from_namespace_async(user_message, namespace)
                    )
                    retrieval_tasks.append(task)
                
                # Wait for all retrieval tasks
                namespace_results = await asyncio.gather(*retrieval_tasks, return_exceptions=True)
                
                # Combine results from all namespaces
                all_matches = []
                for i, result in enumerate(namespace_results):
                    if isinstance(result, Exception):
                        logger.error(f"Retrieval failed for namespace {namespaces[i]}: {result}")
                        continue
                    
                    if isinstance(result, list):
                        all_matches.extend(result)
                
                logger.info(f"Retrieved {len(all_matches)} matches for: {user_message[:50]}...")
                
                # Filter by quality score and deduplicate
                quality_matches = []
                seen_texts = set()
                
                for match in all_matches:
                    if match.get("score", 0) >= 0.65:
                        # Deduplicate by text content
                        text_key = match.get("metadata", {}).get("text_snippet", "")[:200]
                        if text_key not in seen_texts:
                            quality_matches.append(match)
                            seen_texts.add(text_key)
                
                # Sort by score and take top matches
                quality_matches.sort(key=lambda x: x.get("score", 0), reverse=True)
                quality_matches = quality_matches[:6]
                
                if quality_matches:
                    has_quality_context = True
                    rag_context = self._build_quality_context(quality_matches)
                    retrieved_matches = quality_matches
                    logger.info(f"Found {len(quality_matches)} high-quality matches")
                else:
                    logger.info("No high-quality matches found (score < 0.65)")
                    # Still store lower quality matches for potential fallback
                    retrieved_matches = all_matches[:6] if all_matches else []
                    
            except Exception as e:
                logger.error(f"RAG retrieval failed: {e}")
                state["error_count"] = state.get("error_count", 0) + 1
        
        return {
            "rag_context": rag_context,
            "has_quality_context": has_quality_context,
            "retrieved_matches": retrieved_matches
        }
    
    async def _retrieve_from_namespace_async(self, query: str, namespace: str) -> List[Dict[str, Any]]:
        """Async wrapper for namespace-specific retrieval"""
        try:
            matches = retrieve(query, top_k=6, namespaces=[namespace])
            return matches
        except Exception as e:
            logger.error(f"Failed to retrieve from namespace {namespace}: {e}")
            return []
    
    def _build_quality_context(self, passages: List[Dict[str, Any]]) -> str:
        """Build context from high-quality passages"""
        if not passages:
            return ""
        
        context_parts = []
        high_confidence = [p for p in passages if p.get("score", 0) >= 0.8]
        good_confidence = [p for p in passages if 0.65 <= p.get("score", 0) < 0.8]
        
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
    
    async def _generate_response_node(self, state: ChatState) -> Dict[str, Any]:
        """Generate AI response using LangChain"""
        user_message = state["user_message"]
        mode = state.get("mode", "text")
        style = state.get("style", "friendly")
        memory_context = state.get("memory_context", "")
        rag_context = state.get("rag_context", "")
        has_quality_context = state.get("has_quality_context", False)
        file_data = state.get("file_data")
        
        # Build system prompt
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
- Keep responses CONCISE and conversational (max 150 words)
- Use shorter sentences that are easy to understand when spoken
- Be encouraging and supportive
- Ask follow-up questions when appropriate
- Avoid overly technical jargon unless necessary
- Structure answers clearly with 2-3 numbered points maximum"""
        elif mode == "image":
            system_msg = f"""{base_personality}

IMAGE ANALYSIS GUIDELINES:
- You are analyzing a fitness/nutrition related image
- Provide detailed, helpful analysis based on what you can understand from the context
- Give specific, actionable advice related to the image
- Reference form, technique, nutrition, or other relevant aspects
- Be encouraging and constructive in your feedback
 - Focus on the user's question and describe what is likely in the image based on provided content"""
        else:
            system_msg = f"""{base_personality}

INTERACTION GUIDELINES:
- Keep responses FOCUSED and CONCISE (max 200-250 words)
- Provide well-structured, actionable responses
- Use bullet points for clarity (max 5 points)
- Include specific examples when helpful
- Stay directly relevant to the user's question
- Avoid excessive background information unless specifically requested"""

        # Add context usage instructions
        if has_quality_context:
            system_msg += f"""

KNOWLEDGE BASE CONTEXT AVAILABLE:
You have access to high-quality, relevant information from our fitness knowledge base.
- PRIORITIZE the provided context information as it's highly relevant to the user's question
- Use the context as your PRIMARY source for answering
- Supplement with your training knowledge only to enhance or clarify the context
- If context contradicts your training, defer to the context as it's more specific to our knowledge base
- Always acknowledge when you're using knowledge base information vs. general knowledge"""
        else:
            system_msg += f"""

KNOWLEDGE BASE CONTEXT:
No high-quality matches found in our knowledge base.
- Rely on your comprehensive training in fitness, nutrition, and wellness
- Provide expert-level advice based on current best practices
- Use evidence-based recommendations
- Note that you're drawing from general fitness knowledge rather than our specific knowledge base"""

        # Build the prompt
        context_section = ""
        if rag_context:
            context_section += f"\n=== KNOWLEDGE BASE CONTEXT ===\n{rag_context}\n"
        
        if memory_context:
            context_section += f"\n=== CONVERSATION MEMORY ===\n{memory_context}\n"
        
        full_prompt = f"""{system_msg}

{context_section}

User's Question: {user_message}

Instructions: {"Use the above knowledge base information as your primary source. " if has_quality_context else "Answer using your comprehensive fitness knowledge. "}If conversation memory is available, use it to personalize your response and maintain context from previous interactions."""

        try:
            # If image mode, send multimodal payload directly to Groq model
            if mode == "image" and file_data and (file_data.get("image_data") or file_data.get("image_bytes")):
                try:
                    import base64
                    if file_data.get("image_data"):
                        data_url = f"data:{file_data.get('type','image/png')};base64,{file_data['image_data']}"
                    else:
                        encoded = base64.b64encode(file_data["image_bytes"]).decode("utf-8")
                        data_url = f"data:{file_data.get('type','image/png')};base64,{encoded}"

                    mm_messages = [
                        {"role": "system", "content": system_msg},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": full_prompt},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        },
                    ]

                    resp = await self.raw_groq.chat.completions.create(
                        model="meta-llama/llama-4-maverick-17b-128e-instruct",
                        messages=mm_messages,
                        temperature=0.4,
                        max_tokens=512,
                        top_p=0.9,
                    )
                    ai_response = resp.choices[0].message.content
                except Exception as e:
                    logger.warning(f"Multimodal LLM call failed, falling back to text-only: {e}")
                    ai_response = None
            else:
                ai_response = None

            # Generate response with retry logic (text/voice or image fallback)
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    if ai_response is None:
                        messages = [
                            SystemMessage(content=system_msg),
                            HumanMessage(content=full_prompt)
                        ]
                        response = await self.groq_client.ainvoke(messages)
                        ai_response = response.content
                    
                    if not ai_response or ai_response.strip() == "":
                        raise ValueError("Empty response from LLM")
                    
                    break
                    
                except Exception as e:
                    logger.warning(f"LLM attempt {attempt + 1} failed: {e}")
                    if attempt == max_retries - 1:
                        raise
                    continue
            
            # Create AI message
            ai_msg = AIMessage(content=ai_response)
            
            # Update messages in state
            current_messages = state.get("messages", [])
            updated_messages = current_messages + [ai_msg]
            
            response_metadata = {
                "model_used": "meta-llama/llama-4-maverick-17b-128e-instruct",
                "has_memory": bool(memory_context),
                "has_rag_context": has_quality_context,
                "processing_mode": mode,
                "timestamp": datetime.utcnow().isoformat(),
                "retrieved_matches_count": len(state.get("retrieved_matches", []))
            }
            
            return {
                "messages": updated_messages,
                "response_metadata": response_metadata
            }
            
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            error_msg = AIMessage(content="I'm having trouble processing your request right now. Please try again in a moment.")
            current_messages = state.get("messages", [])
            
            return {
                "messages": current_messages + [error_msg],
                "response_metadata": {"error": str(e), "timestamp": datetime.utcnow().isoformat()}
            }
    
    async def _save_conversation_parallel_node(self, state: ChatState) -> Dict[str, Any]:
        """Save conversation to database with parallel processing"""
        session_id = state["session_id"]
        user_id = state["user_id"]
        messages = state.get("messages", [])
        mode = state.get("mode", "text")
        file_data = state.get("file_data")
        response_metadata = state.get("response_metadata", {})
        
        try:
            save_tasks = []
            
            # Create save tasks for parallel execution
            if len(messages) >= 1:
                user_msg = messages[0]
                user_message_doc = {
                    "session_id": session_id,
                    "content": user_msg.content,
                    "message_type": mode,
                    "is_user": True,
                    "file_data": file_data,
                    "timestamp": datetime.utcnow(),
                    "context_used": {
                        "has_rag_context": state.get("has_quality_context", False),
                        "matches_count": len(state.get("retrieved_matches", []))
                    }
                }
                save_tasks.append(
                    asyncio.create_task(self._save_message_async(user_message_doc))
                )
            
            if len(messages) >= 2:
                ai_msg = messages[1]
                ai_message_doc = {
                    "session_id": session_id,
                    "content": ai_msg.content,
                    "message_type": "text",
                    "is_user": False,
                    "timestamp": datetime.utcnow(),
                    "response_metadata": response_metadata
                }
                save_tasks.append(
                    asyncio.create_task(self._save_message_async(ai_message_doc))
                )
            
            # Update session metadata task
            if messages:
                session_update_doc = {
                    "$set": {
                        "updated_at": datetime.utcnow(),
                        "last_message": messages[0].content[:100],
                        "last_message_time": datetime.utcnow()
                    },
                    "$inc": {"message_count": len(messages)}
                }
                save_tasks.append(
                    asyncio.create_task(self._update_session_async(session_id, session_update_doc))
                )
            
            # Execute all save operations in parallel
            if save_tasks:
                results = await asyncio.gather(*save_tasks, return_exceptions=True)
                
                # Log results
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        logger.error(f"Save task {i} failed: {result}")
                    else:
                        logger.info(f"Save task {i} completed successfully")
            
            # Update memory in parallel with conversation saving
            if len(messages) >= 2:
                asyncio.create_task(self._update_memory_async(
                    session_id, messages[0].content, messages[1].content, mode
                ))
            
        except Exception as e:
            logger.error(f"Error saving conversation: {e}")
            state["error_count"] = state.get("error_count", 0) + 1
        
        return {}
    
    async def _save_message_async(self, message_doc: Dict[str, Any]) -> str:
        """Async wrapper for message saving"""
        result = self.chat_messages.insert_one(message_doc)
        return str(result.inserted_id)
    
    async def _update_session_async(self, session_id: str, update_doc: Dict[str, Any]) -> int:
        """Async wrapper for session updating"""
        result = self.chat_sessions.update_one(
            {"_id": ObjectId(session_id)},
            update_doc
        )
        return result.modified_count
    
    async def _update_memory_async(self, session_id: str, user_message: str, ai_response: str, mode: str):
        """Async wrapper for memory updating"""
        try:
            await MemoryService.update_session_memory(
                session_id=session_id,
                user_message=user_message,
                ai_response=ai_response,
                message_type=mode
            )
            # Invalidate memory cache
            if session_id in self.memory_cache:
                del self.memory_cache[session_id]
            logger.info(f"Updated memory for session: {session_id}")
        except Exception as e:
            logger.error(f"Error updating memory: {e}")
    
    async def _finalize_response_node(self, state: ChatState) -> Dict[str, Any]:
        """Finalize the response with performance metrics"""
        processing_time = time.time() - state.get("processing_start_time", time.time())
        
        # Update response metadata with performance info
        response_metadata = state.get("response_metadata", {})
        response_metadata.update({
            "processing_time": processing_time,
            "error_count": state.get("error_count", 0),
            "retry_count": state.get("retry_count", 0),
            "cache_hits": {
                "memory": session_id in self.memory_cache for session_id in [state.get("session_id", "")]
            },
            "performance_optimized": True
        })
        
        logger.info(f"Request completed in {processing_time:.2f}s with {state.get('error_count', 0)} errors")
        
        return {"response_metadata": response_metadata}
    
    async def _error_handler_node(self, state: ChatState) -> Dict[str, Any]:
        """Handle errors and provide fallback responses"""
        error_count = state.get("error_count", 0)
        messages = state.get("messages", [])
        
        if error_count > 0 and not messages:
            # Create fallback response
            error_msg = AIMessage(content="I apologize, but I'm experiencing some technical difficulties. Please try rephrasing your question or try again in a moment.")
            return {"messages": [error_msg]}
        
        return {}
    
    async def _update_memory_node(self, state: ChatState) -> Dict[str, Any]:
        """Update conversation memory"""
        session_id = state["session_id"]
        messages = state.get("messages", [])
        mode = state.get("mode", "text")
        
        try:
            if len(messages) >= 2:
                user_message = messages[0].content
                ai_response = messages[1].content
                
                # Update memory using the existing service
                await MemoryService.update_session_memory(
                    session_id=session_id,
                    user_message=user_message,
                    ai_response=ai_response,
                    message_type=mode
                )
                logger.info(f"Updated memory for session: {session_id}")
        
        except Exception as e:
            logger.error(f"Error updating memory: {e}")
        
        return {}
    
    async def chat(
        self,
        user_message: str,
        user_id: str,
        session_id: Optional[str] = None,
        mode: str = "text",
        style: str = "friendly",
        file_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Enhanced main chat interface with improved error handling and performance"""
        
        start_time = time.time()
        
        # Create enhanced initial state
        initial_state = ChatState(
            messages=[],
            session_id=session_id or "",
            user_id=user_id,
            user_message=user_message,
            mode=mode,
            style=style,
            file_data=file_data,
            rag_context=None,
            memory_context=None,
            has_quality_context=False,
            conversation_memory=None,
            response_metadata={
                "request_start_time": start_time,
                "optimizations_enabled": True
            },
            retrieved_matches=[],
            processing_start_time=start_time,
            error_count=0,
            retry_count=0
        )
        
        # Create config with proper thread ID for session isolation
        # Always use a unique thread ID to prevent session conflicts
        if session_id:
            thread_id = f"session_{session_id}"
        else:
            # For new sessions, create a unique thread ID that will be updated after session creation
            thread_id = f"new_{user_id}_{int(start_time * 1000000)}"  # Microsecond precision for uniqueness
        
        config = RunnableConfig(
            configurable={
                "thread_id": thread_id,
                "user_id": user_id,
                "session_context": {
                    "mode": mode,
                    "style": style,
                    "timestamp": start_time,
                    "new_session": not bool(session_id)
                }
            }
        )
        
        try:
            # Run the enhanced graph
            result = await self.graph.ainvoke(initial_state, config)
            
            # Extract response with better error handling
            messages = result.get("messages", [])
            if not messages:
                logger.warning("No messages in result, creating fallback response")
                ai_response = "I apologize, but I couldn't process your request properly. Please try again."
            else:
                ai_response = messages[-1].content if messages[-1].content else "I couldn't generate a response."
            
            # Validate and clean response
            if not ai_response or ai_response.strip() == "":
                ai_response = "I apologize, but I couldn't generate a proper response. Please try rephrasing your question."
            
            # Calculate total processing time
            total_time = time.time() - start_time
            
            # Enhanced response metadata
            response_metadata = result.get("response_metadata", {})
            response_metadata.update({
                "total_processing_time": total_time,
                "graph_execution_success": True,
                "message_count": len(messages),
                "session_id": result.get("session_id", session_id)
            })
            
            logger.info(f"Enhanced chat completed successfully in {total_time:.2f}s for session: {result.get('session_id', 'unknown')}")
            
            return {
                "reply": ai_response,
                "session_id": result.get("session_id", session_id),
                "response_metadata": response_metadata,
                "success": True,
                "processing_time": total_time
            }
            
        except Exception as e:
            total_time = time.time() - start_time
            logger.error(f"Enhanced graph execution error after {total_time:.2f}s: {e}")
            
            # Enhanced error response
            return {
                "error": f"Chat processing failed: {str(e)}",
                "session_id": session_id,
                "success": False,
                "processing_time": total_time,
                "error_type": type(e).__name__,
                "response_metadata": {
                    "error_occurred": True,
                    "error_time": total_time,
                    "fallback_used": True
                }
            }


# Global instance
langgraph_chat_service = LangGraphChatService()

