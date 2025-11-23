# app/services/memory_service.py
import json
import asyncio
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from groq import AsyncGroq
from app.services.chat_service import ChatService
from app.models.chat import ConversationMemory

import os
from dotenv import load_dotenv

load_dotenv()

groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

# Memory optimization cache
_memory_cache = {}
_cache_ttl = 300  # 5 minutes

# User profile cache for personalization
_profile_cache = {}
_profile_cache_ttl = 600  # 10 minutes for profile data

class MemoryService:
    """Service for managing conversation memory and context extraction"""
    
    @staticmethod
    async def _cleanup_cache():
        """Clean up expired cache entries"""
        current_time = time.time()
        expired_keys = [k for k, v in _memory_cache.items() 
                       if current_time - v.get('timestamp', 0) > _cache_ttl]
        for key in expired_keys:
            del _memory_cache[key]
    
    @staticmethod
    async def extract_conversation_insights(
        session_id: str,
        user_message: str,
        ai_response: str,
        message_type: str = "text"
    ) -> Dict[str, Any]:
        """Extract insights from the conversation to build memory with caching"""
        
        # Check cache first
        cache_key = f"insights_{session_id}_{hash(user_message + ai_response)}"
        if cache_key in _memory_cache:
            cached_data = _memory_cache[cache_key]
            if time.time() - cached_data['timestamp'] < _cache_ttl:
                return cached_data['data']
        
        await MemoryService._cleanup_cache()
        
        # Get existing memory with parallel processing
        memory_tasks = [
            ChatService.get_conversation_memory(session_id),
            MemoryService._extract_simple_insights(user_message, ai_response, message_type)
        ]
        
        existing_memory, simple_insights = await asyncio.gather(*memory_tasks, return_exceptions=True)
        
        # Handle exceptions
        if isinstance(existing_memory, Exception):
            existing_memory = None
        if isinstance(simple_insights, Exception):
            simple_insights = None
        
        # Use simple insights as fallback if available
        if simple_insights and not existing_memory:
            _memory_cache[cache_key] = {
                'data': simple_insights,
                'timestamp': time.time()
            }
            return simple_insights
        
        # Prepare context for analysis
        analysis_prompt = f"""Analyze this fitness coaching conversation and extract key insights:

USER MESSAGE: "{user_message}"
AI RESPONSE: "{ai_response}"
MESSAGE TYPE: {message_type}

EXISTING USER PROFILE: {json.dumps(existing_memory.fitness_profile if existing_memory else {}, indent=2)}
EXISTING PREFERENCES: {json.dumps(existing_memory.user_preferences if existing_memory else {}, indent=2)}
EXISTING GOALS: {existing_memory.user_goals if existing_memory else []}
EXISTING TOPICS: {existing_memory.key_topics if existing_memory else []}

Extract and return JSON with:
{{
  "user_preferences": {{
    "communication_style": "direct/encouraging/detailed/etc",
    "preferred_workout_types": ["cardio", "strength", "etc"],
    "time_preferences": "morning/evening/etc",
    "experience_level": "beginner/intermediate/advanced",
    "equipment_access": ["gym", "home", "bodyweight", "etc"]
  }},
  "fitness_profile": {{
    "current_goals": ["weight_loss", "muscle_gain", "endurance", "etc"],
    "health_conditions": ["any mentioned conditions"],
    "current_activities": ["running", "weightlifting", "etc"],
    "challenges": ["time", "motivation", "injuries", "etc"],
    "achievements": ["any progress mentioned"]
  }},
  "key_topics": ["topic1", "topic2", "etc"],
  "user_goals": ["specific goal 1", "specific goal 2", "etc"],
  "conversation_context": [
    {{
      "topic": "main topic discussed",
      "user_intent": "what user wanted",
      "ai_advice": "key advice given",
      "timestamp": "{datetime.now(timezone.utc).isoformat()}"
    }}
  ]
}}

Only include information that was explicitly mentioned or can be reasonably inferred. If no new information, return existing values."""

        try:
            # Add retry logic for memory extraction
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    resp = await groq_client.chat.completions.create(
                        model="meta-llama/llama-4-maverick-17b-128e-instruct",
                        messages=[
                            {"role": "system", "content": "You are an expert at extracting structured information from fitness coaching conversations. Return only valid JSON."},
                            {"role": "user", "content": analysis_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=1024,
                        timeout=30.0
                    )
                    
                    # Parse the JSON response
                    response_content = resp.choices[0].message.content.strip()
                    
                    # Clean up response content to ensure valid JSON
                    if response_content.startswith("```json"):
                        response_content = response_content.replace("```json", "").replace("```", "").strip()
                    elif response_content.startswith("```"):
                        response_content = response_content.replace("```", "").strip()
                    
                    insights = json.loads(response_content)
                    
                    # Validate the structure
                    required_keys = ["user_preferences", "fitness_profile", "key_topics", "user_goals", "conversation_context"]
                    if all(key in insights for key in required_keys):
                        return insights
                    else:
                        raise ValueError("Invalid response structure")
                    
                except json.JSONDecodeError as e:
                    print(f"JSON parsing failed on attempt {attempt + 1}: {e}")
                    if attempt == max_retries - 1:
                        raise
                    continue
                except Exception as e:
                    print(f"Memory extraction attempt {attempt + 1} failed: {e}")
                    if attempt == max_retries - 1:
                        raise
                    continue
            
        except Exception as e:
            print(f"Memory extraction failed after all retries: {e}")
            # Return enhanced fallback with better context extraction
            fallback_topics = []
            if "workout" in user_message.lower() or "exercise" in user_message.lower():
                fallback_topics.append("workout_planning")
            if "diet" in user_message.lower() or "nutrition" in user_message.lower():
                fallback_topics.append("nutrition")
            if "weight" in user_message.lower():
                fallback_topics.append("weight_management")
            if not fallback_topics:
                fallback_topics.append("general_fitness")
            
            fallback_result = {
                "user_preferences": existing_memory.user_preferences if existing_memory else {},
                "fitness_profile": existing_memory.fitness_profile if existing_memory else {},
                "key_topics": (existing_memory.key_topics if existing_memory else []) + fallback_topics,
                "user_goals": existing_memory.user_goals if existing_memory else [],
                "conversation_context": [{
                    "topic": fallback_topics[0] if fallback_topics else "general_fitness",
                    "user_intent": user_message[:100],
                    "ai_advice": ai_response[:100],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "extraction_method": "fallback"
                }]
            }
            
            # Cache the fallback result
            _memory_cache[cache_key] = {
                'data': fallback_result,
                'timestamp': time.time()
            }
            
            return fallback_result
    
    @staticmethod
    async def _extract_simple_insights(
        user_message: str,
        ai_response: str,
        message_type: str
    ) -> Dict[str, Any]:
        """Extract simple insights without LLM processing for faster fallback"""
        key_topics = []
        user_goals = []
        
        # Simple keyword-based extraction
        message_lower = user_message.lower()
        
        # Extract topics
        if any(word in message_lower for word in ["workout", "exercise", "training", "gym"]):
            key_topics.append("workout_planning")
        if any(word in message_lower for word in ["diet", "nutrition", "eat", "food"]):
            key_topics.append("nutrition")
        if any(word in message_lower for word in ["weight", "lose", "gain"]):
            key_topics.append("weight_management")
        if any(word in message_lower for word in ["run", "cardio", "endurance"]):
            key_topics.append("cardio")
        if any(word in message_lower for word in ["strength", "muscle", "lift"]):
            key_topics.append("strength_training")
        
        # Extract goals
        if any(phrase in message_lower for phrase in ["lose weight", "weight loss"]):
            user_goals.append("weight_loss")
        if any(phrase in message_lower for phrase in ["gain muscle", "build muscle"]):
            user_goals.append("muscle_gain")
        if any(phrase in message_lower for phrase in ["get fit", "fitness", "healthy"]):
            user_goals.append("general_fitness")
        
        return {
            "user_preferences": {},
            "fitness_profile": {},
            "key_topics": key_topics or ["general_fitness"],
            "user_goals": user_goals,
            "conversation_context": [{
                "topic": key_topics[0] if key_topics else "general_fitness",
                "user_intent": user_message[:100],
                "ai_advice": ai_response[:100],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "extraction_method": "simple"
            }]
        }
    
    @staticmethod
    async def build_memory_context(session_id: str, user_id: Optional[str] = None, include_profile: bool = True) -> str:
        """Build context string from conversation memory for LLM with caching and user profile integration
        
        Args:
            session_id: Chat session ID
            user_id: User ID for profile integration
            include_profile: Whether to include user profile context (default True, set False for greetings)
        """
        
        # Check cache first
        cache_key = f"context_{session_id}_{'with_profile' if include_profile else 'no_profile'}"
        if cache_key in _memory_cache:
            cached_data = _memory_cache[cache_key]
            if time.time() - cached_data['timestamp'] < _cache_ttl:
                return cached_data['data']
        
        # Get conversation memory and user profile in parallel
        memory_task = ChatService.get_conversation_memory(session_id)
        profile_task = MemoryService._get_user_profile_context(user_id) if (user_id and include_profile) else None
        
        if profile_task:
            memory, profile_context = await asyncio.gather(memory_task, profile_task, return_exceptions=True)
            
            # Handle exceptions
            if isinstance(memory, Exception):
                memory = None
            if isinstance(profile_context, Exception):
                profile_context = ""
        else:
            memory = await memory_task
            profile_context = ""
        
        if not memory and not profile_context:
            return ""
        
        context_parts = []
        
        # User preferences (check if memory exists first)
        if memory and memory.user_preferences:
            context_parts.append("=== USER PREFERENCES ===")
            for key, value in memory.user_preferences.items():
                if value:
                    context_parts.append(f"- {key.replace('_', ' ').title()}: {value}")
        
        # Fitness profile (check if memory exists first)
        if memory and memory.fitness_profile:
            context_parts.append("\n=== FITNESS PROFILE ===")
            for key, value in memory.fitness_profile.items():
                if value:
                    if isinstance(value, list):
                        context_parts.append(f"- {key.replace('_', ' ').title()}: {', '.join(map(str, value))}")
                    else:
                        context_parts.append(f"- {key.replace('_', ' ').title()}: {value}")
        
        # Goals (check if memory exists first)
        if memory and memory.user_goals:
            context_parts.append(f"\n=== USER GOALS ===")
            for goal in memory.user_goals:
                context_parts.append(f"- {goal}")
        
        # Recent conversation context (check if memory exists first)
        if memory and memory.conversation_context:
            context_parts.append(f"\n=== RECENT CONVERSATION CONTEXT ===")
            # Show last 3 conversation contexts
            for ctx in memory.conversation_context[-3:]:
                context_parts.append(f"- {ctx.get('topic', 'General')}: {ctx.get('user_intent', '')[:50]}...")
        
        # Key topics (check if memory exists first)
        if memory and memory.key_topics:
            context_parts.append(f"\n=== KEY TOPICS DISCUSSED ===")
            context_parts.append(f"- {', '.join(memory.key_topics[-10:])}")  # Last 10 topics
        
        # Add user profile context at the beginning for maximum impact
        if profile_context:
            context_parts.insert(0, profile_context)
        
        context_result = "\n".join(context_parts) if context_parts else ""
        
        # Cache the result
        _memory_cache[cache_key] = {
            'data': context_result,
            'timestamp': time.time()
        }
        
        return context_result
    
    @staticmethod
    async def _get_user_profile_context(user_id: str) -> str:
        """Get user profile context with caching"""
        if not user_id:
            return ""
        
        # Check profile cache first
        profile_cache_key = f"profile_{user_id}"
        if profile_cache_key in _profile_cache:
            cached_profile = _profile_cache[profile_cache_key]
            if time.time() - cached_profile['timestamp'] < _profile_cache_ttl:
                return cached_profile['data']
        
        try:
            # Import here to avoid circular imports
            from app.services.user_profile_service import UserProfileService
            
            # Get comprehensive user profile
            profile_data = await UserProfileService.get_comprehensive_user_profile(user_id)
            
            # Build personalization context
            profile_context = UserProfileService.build_personalization_context(profile_data)
            
            # Cache the result
            _profile_cache[profile_cache_key] = {
                'data': profile_context,
                'timestamp': time.time()
            }
            
            return profile_context
            
        except Exception as e:
            print(f"Error loading user profile context: {e}")
            return ""
    
    @staticmethod
    async def clear_user_profile_cache(user_id: str):
        """Clear user profile cache when profile is updated"""
        profile_cache_key = f"profile_{user_id}"
        if profile_cache_key in _profile_cache:
            del _profile_cache[profile_cache_key]
        
        # Also clear related memory cache entries
        memory_keys_to_remove = [k for k in _memory_cache.keys() if user_id in k]
        for key in memory_keys_to_remove:
            del _memory_cache[key]
    
    @staticmethod
    async def get_user_profile_summary(user_id: str) -> Dict[str, Any]:
        """Get a quick summary of user profile for debugging/monitoring"""
        try:
            from app.services.user_profile_service import UserProfileService
            return await UserProfileService.get_user_personalization_summary(user_id)
        except Exception as e:
            return {"error": str(e), "user_id": user_id}
    
    @staticmethod
    async def update_session_memory(
        session_id: str,
        user_message: str,
        ai_response: str,
        message_type: str = "text"
    ):
        """Update conversation memory after each interaction with optimization"""
        try:
            # Invalidate cache for this session
            cache_keys_to_remove = [k for k in _memory_cache.keys() if session_id in k]
            for key in cache_keys_to_remove:
                del _memory_cache[key]
            
            # Extract insights with parallel processing
            insights_task = MemoryService.extract_conversation_insights(
                session_id, user_message, ai_response, message_type
            )
            existing_memory_task = ChatService.get_conversation_memory(session_id)
            
            insights, existing_memory = await asyncio.gather(
                insights_task, existing_memory_task, return_exceptions=True
            )
            
            # Handle exceptions
            if isinstance(insights, Exception):
                print(f"Failed to extract insights: {insights}")
                return
            if isinstance(existing_memory, Exception):
                existing_memory = None
            
            # Merge preferences (new values override old ones)
            merged_preferences = existing_memory.user_preferences if existing_memory else {}
            merged_preferences.update(insights.get("user_preferences", {}))
            
            # Merge fitness profile
            merged_profile = existing_memory.fitness_profile if existing_memory else {}
            merged_profile.update(insights.get("fitness_profile", {}))
            
            # Merge goals (deduplicate)
            existing_goals = existing_memory.user_goals if existing_memory else []
            new_goals = insights.get("user_goals", [])
            merged_goals = list(set(existing_goals + new_goals))
            
            # Merge topics (deduplicate)
            existing_topics = existing_memory.key_topics if existing_memory else []
            new_topics = insights.get("key_topics", [])
            merged_topics = list(set(existing_topics + new_topics))
            
            # Merge conversation context
            existing_context = existing_memory.conversation_context if existing_memory else []
            new_context = insights.get("conversation_context", [])
            merged_context = existing_context + new_context
            
            # Update memory
            await ChatService.update_conversation_memory(
                session_id=session_id,
                user_preferences=merged_preferences,
                conversation_context=merged_context,
                key_topics=merged_topics,
                user_goals=merged_goals,
                fitness_profile=merged_profile
            )
            
        except Exception as e:
            print(f"Failed to update session memory: {e}")
            # Don't fail the main conversation if memory update fails
            pass
    
    @staticmethod
    async def generate_session_title(session_id: str, first_message: str) -> str:
        """Generate a meaningful title for the chat session"""
        try:
            title_prompt = f"""Generate a short, descriptive title (max 4-5 words) for a fitness coaching chat session based on the first user message:

USER MESSAGE: "{first_message}"

Return only the title, nothing else. Examples:
- "Weight Loss Plan"
- "Beginner Workout Help"
- "Nutrition Questions"
- "Running Training"
- "Home Gym Setup"

Title:"""

            resp = await groq_client.chat.completions.create(
                model="meta-llama/llama-4-maverick-17b-128e-instruct",
                messages=[
                    {"role": "system", "content": "You are an expert at creating concise, descriptive titles."},
                    {"role": "user", "content": title_prompt}
                ],
                temperature=0.3,
                max_tokens=50
            )
            
            title = resp.choices[0].message.content.strip()
            # Clean up the title
            title = title.replace('"', '').replace("Title:", "").strip()
            
            # Fallback if title is too long or empty
            if len(title) > 50 or len(title) < 3:
                return f"Chat {datetime.now().strftime('%m/%d %H:%M')}"
            
            return title
            
        except Exception as e:
            print(f"Title generation failed: {e}")
            return f"Chat {datetime.now().strftime('%m/%d %H:%M')}"
