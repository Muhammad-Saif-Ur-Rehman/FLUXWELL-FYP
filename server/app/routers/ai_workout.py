# app/routers/ai_workout.py

from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional, Dict, Any, List
from groq import Groq
from app.database.connection import db
from datetime import datetime, timedelta
import random
from bson import ObjectId
import os, json, asyncio
import hashlib
import os
import redis
from functools import wraps

# If using MCP client SDK
import httpx

# Redis connection for caching (graceful fallback if unavailable)
def _init_redis_client():
    host = os.getenv('REDIS_HOST', 'localhost')
    try:
        client = redis.Redis(host=host, port=int(os.getenv('REDIS_PORT', '6379')), db=0, decode_responses=True)
        # ping to verify availability
        client.ping()
        return client
    except Exception as e:
        print(f"[Cache] Redis unavailable at {host}:{os.getenv('REDIS_PORT','6379')}: {e}. Caching disabled.")
        return None

redis_client = _init_redis_client()

def cache_key_generator(*args, **kwargs):
    """Generate a cache key from function arguments"""
    key_data = {
        'args': args,
        'kwargs': {k: v for k, v in kwargs.items() if k != 'user_id'}
    }
    key_string = json.dumps(key_data, sort_keys=True)
    return hashlib.md5(key_string.encode()).hexdigest()

def cache_result(expiry_seconds=300):  # 5 minutes default
    """Decorator to cache function results"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"exercise_cache:{cache_key_generator(*args, **kwargs)}"
            
            # Try to get from cache
            if redis_client:
                try:
                    cached_result = redis_client.get(cache_key)
                    if cached_result:
                        print(f"[Cache] Hit for key: {cache_key[:20]}...")
                        return json.loads(cached_result)
                except Exception as e:
                    print(f"[Cache] Error reading from cache: {e}")
            
            # Execute function if not in cache
            result = await func(*args, **kwargs)
            
            # Cache the result
            if redis_client:
                try:
                    redis_client.setex(cache_key, expiry_seconds, json.dumps(result))
                    print(f"[Cache] Stored result for key: {cache_key[:20]}...")
                except Exception as e:
                    print(f"[Cache] Error storing in cache: {e}")
            
            return result
        return wrapper
    return decorator

router = APIRouter(prefix="/ai/workout", tags=["AI Workout"])

from app.auth.jwt_auth import get_current_user_id

# Init Groq client and model
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama3.1-8b-instant")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Init MCP clients (URLs configurable via env)
EX_MCP_URL = os.getenv("EXERCISE_MCP_URL", "http://localhost:8081")
USER_MCP_URL = os.getenv("USER_PROFILE_MCP_URL", "http://localhost:8082")
PLAN_MCP_URL = os.getenv("WORKOUT_PLAN_MCP_URL", "http://localhost:8083")
exercise_client = EX_MCP_URL
user_client = USER_MCP_URL
plan_client = PLAN_MCP_URL

# -------------------- TOOLS (Groq Function Calling) --------------------
GROQ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "exercise-db.filter_exercises",
            "description": "Filter exercises from ExerciseDB",
            "parameters": {
                "type": "object",
                "properties": {
                    "muscles": {"type": "array", "items": {"type": "string"}},
                    "body_parts": {"type": "array", "items": {"type": "string"}},
                    "equipment": {"type": "array", "items": {"type": "string"}},
                    "limit": {"type": "integer"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "user-profile.get_user_profile",
            "description": "Get onboarding details for a user",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string"}
                },
                "required": ["user_id"]
            }
        }
    }
]
# -----------------------------------------------------------------------

# ---------------- Helper: Execute MCP tool call ------------------------
async def call_mcp(base_url: str, tool: str, params: dict) -> dict:
    try:
        if not base_url:
            return {"error": "MCP client not available"}
        async with httpx.AsyncClient(timeout=20) as client:
            # Map tool -> HTTP path
            tool_map = {
                "search_exercises": ("POST", "/tools/search_exercises"),
                "filter_exercises": ("POST", "/tools/filter_exercises"),
                "list_body_parts": ("GET", "/tools/list_body_parts"),
                "get_user_profile": ("GET", "/tools/get_user_profile"),
                "get_workout_profile": ("GET", "/tools/get_workout_profile"),
                "save_plan": ("POST", "/tools/save_plan"),
                "get_plan": ("GET", "/tools/get_plan"),
            }
            method, path = tool_map.get(tool, (None, None))
            if not method:
                return {"error": f"Unknown tool {tool}"}
            url = f"{base_url}{path}"
            if method == "GET":
                r = await client.get(url, params=params or {})
            else:
                r = await client.post(url, json=params or {})
            r.raise_for_status()
            return r.json()
    except Exception as e:
        return {"error": str(e)}
# -----------------------------------------------------------------------

# Helper function to determine exercise focus based on target muscles and body parts
def determine_exercise_focus(target_muscles: list, body_parts: list) -> str:
    """Determine exercise focus category based on target muscles and body parts."""
    all_targets = [t.lower().strip() for t in (target_muscles or []) + (body_parts or []) if t and t.strip()]
    
    # Check for lower body exercises first (most specific)
    lower_body_keywords = ['legs', 'glutes', 'hamstrings', 'quads', 'calves', 'lower legs', 'upper legs', 'thighs', 'gluteals', 'quadriceps', 'hamstring', 'calf', 'gluteus', 'adductors', 'abductors', 'hip flexors', 'hip extensors', 'gluteus maximus', 'gluteus medius', 'gluteus minimus']
    if any(keyword in t for t in all_targets for keyword in lower_body_keywords):
        return 'Lower Body'
    
    # Check for push exercises (chest, shoulders, triceps)
    push_keywords = ['chest', 'shoulders', 'triceps', 'pectorals', 'deltoids', 'shoulder', 'chest', 'tricep', 'push', 'press', 'fly', 'dip', 'bench', 'incline', 'decline', 'pecs', 'pectoralis', 'anterior deltoid', 'lateral deltoid', 'posterior deltoid']
    push_matches = sum(1 for t in all_targets for keyword in push_keywords if keyword in t)
    
    # Check for pull exercises (back, biceps)
    pull_keywords = ['back', 'biceps', 'lats', 'rhomboids', 'traps', 'upper back', 'bicep', 'lat', 'rhomboid', 'trap', 'pull', 'row', 'curl', 'latissimus', 'rhomboid', 'trapezius', 'rear deltoid', 'posterior deltoid', 'lat pulldown', 'chin up', 'pull up']
    pull_matches = sum(1 for t in all_targets for keyword in pull_keywords if keyword in t)
    
    # If it's clearly a push or pull exercise, categorize accordingly
    if push_matches > 0 and pull_matches == 0:
        return 'Push'
    elif pull_matches > 0 and push_matches == 0:
        return 'Pull'
    elif push_matches > 0 and pull_matches > 0:
        # Mixed upper body - determine based on which is more prominent
        return 'Push' if push_matches >= pull_matches else 'Pull'
    
    # Check for upper body exercises (any upper body muscle)
    upper_body_keywords = ['chest', 'back', 'shoulders', 'arms', 'triceps', 'biceps', 'upper arms', 'upper back', 'pectorals', 'deltoids', 'lats', 'rhomboids', 'traps', 'arm', 'shoulder', 'chest', 'upper body', 'forearms', 'wrist', 'elbow', 'neck', 'cervical']
    if any(keyword in t for t in all_targets for keyword in upper_body_keywords):
        return 'Upper Body'
    
    # Check for full body exercises
    full_body_keywords = ['full body', 'core', 'cardio', 'abs', 'abdominals', 'waist', 'abdominal', 'cardio', 'core', 'fullbody', 'full-body', 'functional', 'compound', 'multi-joint', 'stabilization', 'balance', 'coordination', 'plyometric', 'explosive', 'olympic', 'power']
    if any(keyword in t for t in all_targets for keyword in full_body_keywords):
        return 'Full Body'
    
    # Default fallback - try to determine from exercise name patterns
    if all_targets:
        # If we have targets but they don't match our keywords, default to Full Body
        return 'Full Body'
    
    # If no targets at all, default to Full Body
    return 'Full Body'

async def load_single_category(category, target_exercises_per_category, filters, fallback_bp_map, exercise_client, call_mcp, normalize_list, _gif):
    """Load exercises for a single category - extracted for parallel processing"""
    category_exercises = []
    
    try:
        # Strategy 1: Try MCP with full muscle/body part list
        try:
            params = {
                "limit": min(target_exercises_per_category * 3, 1000),  # Further increased limit for more exercises
                "offset": random.randint(0, 500),  # Increased offset range for variety
                "sortBy": "name",
                "sortOrder": "asc"
            }
            
            # Add muscle and body part filters for this category
            params["muscles"] = category["muscles"]
            params["body_parts"] = category["body_parts"]
            
            # Add other filters if provided
            if filters.get("equipment"):
                params["equipment"] = filters["equipment"]
            if filters.get("search"):
                params["search"] = filters["search"]
            
            print(f"[Diverse-Exercises] Loading {category['name']} with params: {params}")
            res = await call_mcp(exercise_client, "filter_exercises", params)
            lst = normalize_list(res)
            print(f"[Diverse-Exercises] {category['name']} returned {len(lst)} exercises")
            
            # Process MCP results
            for r in lst:
                gif = _gif(r)
                if not gif:
                    gif = ""
                    
                target_muscles = r.get("targetMuscles") or r.get("target") or []
                if isinstance(target_muscles, str):
                    target_muscles = [target_muscles]
                body_parts_norm = r.get("bodyParts") or []
                if not body_parts_norm and isinstance(r.get("bodyPart"), str):
                    body_parts_norm = [r.get("bodyPart")]
                equipments = r.get("equipments") or []
                if not equipments and isinstance(r.get("equipment"), str):
                    equipments = [r.get("equipment")]
                secondary = r.get("secondaryMuscles") or []
                instructions = r.get("instructions") or []
                
                # Force the focus to match the category we're loading for
                focus = category["name"]
                
                category_exercises.append({
                    "exerciseId": r.get("exerciseId") or r.get("id") or r.get("_id") or str(r.get("name") or "")[:12],
                    "name": str(r.get("name") or r.get("exercise_name") or "").strip(),
                    "gifUrl": gif,
                    "targetMuscles": target_muscles,
                    "bodyParts": body_parts_norm,
                    "equipments": equipments,
                    "secondaryMuscles": secondary,
                    "instructions": instructions,
                    "focus": focus,
                })
                
        except Exception as e:
            print(f"[MCP-Error] Error loading {category['name']} from MCP: {e}")
        
        # Strategy 2: Fallback to direct API calls
        if len(category_exercises) < 100:  # Increased threshold from 50 to 100
            try:
                import httpx
                base_url = "https://workout-databaese.vercel.app/api/v1"
                bp_list = fallback_bp_map.get(category["name"], [])
                needed = max(200, target_exercises_per_category) - len(category_exercises)  # Increased from 100 to 200
                
                async with httpx.AsyncClient(timeout=15) as client:
                    for bp in bp_list:
                        if needed <= 0:
                            break
                        r = await client.get(f"{base_url}/bodyparts/{bp}/exercises", params={"limit": min(needed * 2, 50)})
                        if r.status_code != 200:
                            print(f"[Fallback-Start] Failed to get exercises for {bp}: {r.status_code}")
                            continue
                        if r.status_code == 200:
                            data = r.json()
                            items = data.get("data") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                            
                            for item in items:
                                if needed <= 0:
                                    break
                                if not isinstance(item, dict):
                                    continue
                                
                                gif = item.get("gifUrl") or ""
                                tm = item.get("targetMuscles") or []
                                if not tm and isinstance(item.get("target"), str):
                                    tm = [item.get("target")]
                                bp_norm = item.get("bodyParts") or []
                                if not bp_norm and isinstance(item.get("bodyPart"), str):
                                    bp_norm = [item.get("bodyPart")]
                                
                                focus = category["name"]
                                
                                category_exercises.append({
                                    "exerciseId": item.get("exerciseId") or item.get("id") or str(hash(str(item))),
                                    "name": item.get("name") or "Unknown Exercise",
                                    "gifUrl": gif,
                                    "targetMuscles": tm,
                                    "bodyParts": bp_norm,
                                    "equipments": item.get("equipments") or [],
                                    "secondaryMuscles": item.get("secondaryMuscles") or [],
                                    "instructions": item.get("instructions") or [],
                                    "focus": focus,
                                })
                                needed -= 1
            except Exception as e:
                print(f"Error in fallback for {category['name']}: {e}")
    
    except Exception as e:
        print(f"Error loading exercises for category {category['name']}: {e}")
    
    return category_exercises

# Utility: normalize exercise fields for robust filtering
def _normalize_exercise_fields(ex: dict) -> dict:
    name = str(ex.get("name") or "")
    target_muscles = ex.get("targetMuscles") or ex.get("target") or []
    if isinstance(target_muscles, str):
        target_muscles = [target_muscles]
    target_muscles = [str(m).lower().strip() for m in target_muscles if m]
    body_parts = ex.get("bodyParts") or []
    if not body_parts and isinstance(ex.get("bodyPart"), str):
        body_parts = [ex.get("bodyPart")]
    body_parts = [str(bp).lower().strip() for bp in body_parts if bp]
    equipments = ex.get("equipments") or []
    if not equipments and isinstance(ex.get("equipment"), str):
        equipments = [ex.get("equipment")]
    equipments = [str(eq).lower().strip() for eq in equipments if eq]
    focus_value = str(ex.get("focus") or "").strip()
    if not focus_value:
        # Compute if missing
        try:
            focus_value = determine_exercise_focus(target_muscles, body_parts)
        except Exception:
            focus_value = "Full Body"
    return {
        "name": name,
        "target_muscles": target_muscles,
        "body_parts": body_parts,
        "equipments": equipments,
        "focus": focus_value.lower()
    }

@cache_result(expiry_seconds=1800)  # Cache for 30 minutes for better performance
async def _get_diverse_exercises(limit: int, filters: dict) -> dict:
    """Get a diverse set of exercises from different focus categories with caching."""
    print(f"[Diverse-Exercises] Starting with limit: {limit}, filters: {filters}")
    
    # Parse requested focuses (optional)
    focus_raw = filters.get("focus")
    focuses_raw = filters.get("focuses")
    requested_focuses: list[str] = []
    if isinstance(focus_raw, str) and focus_raw.strip():
        requested_focuses = [focus_raw]
    if isinstance(focuses_raw, list):
        requested_focuses += [f for f in focuses_raw if isinstance(f, str) and f.strip()]
    # Normalize focus names
    if requested_focuses:
        fmap = {
            "upper-body": "upper body",
            "upper body": "upper body",
            "upperbody": "upper body",
            "lower-body": "lower body",
            "lower body": "lower body",
            "lowerbody": "lower body",
            "full-body": "full body",
            "full body": "full body",
            "fullbody": "full body",
            "push": "push",
            "pull": "pull",
        }
        requested_focuses = list({fmap.get(str(f).lower().strip(), str(f).lower().strip()) for f in requested_focuses})

    # Define focus categories and their corresponding muscle/body part filters
    focus_categories = [
        {
            "name": "Upper Body",
            "muscles": ["chest", "back", "shoulders", "arms", "triceps", "biceps", "pectorals", "deltoids", "lats", "rhomboids", "traps", "forearms", "wrist", "neck", "cervical", "anterior deltoid", "lateral deltoid", "posterior deltoid"],
            "body_parts": ["upper arms", "shoulders", "chest", "back", "neck", "lower arms"]
        },
        {
            "name": "Lower Body", 
            "muscles": ["legs", "glutes", "hamstrings", "quads", "calves", "gluteals", "quadriceps", "hamstring", "calf", "gluteus", "adductors", "abductors", "hip flexors", "hip extensors"],
            "body_parts": ["lower legs", "upper legs", "waist"]
        },
        {
            "name": "Full Body",
            "muscles": ["full body", "core", "abs", "abdominals", "cardio", "functional", "compound", "stabilization", "balance", "coordination", "plyometric", "explosive", "olympic", "power"],
            "body_parts": ["waist", "back", "chest", "cardio", "upper legs", "lower legs"]
        },
        {
            "name": "Push",
            "muscles": ["chest", "shoulders", "triceps", "pectorals", "deltoids", "anterior deltoid", "lateral deltoid", "bench", "incline", "decline", "pecs", "pectoralis"],
            "body_parts": ["chest", "shoulders", "upper arms"]
        },
        {
            "name": "Pull",
            "muscles": ["back", "biceps", "lats", "rhomboids", "traps", "latissimus", "trapezius", "rear deltoid", "posterior deltoid", "lat pulldown", "chin up", "pull up"],
            "body_parts": ["back", "upper arms", "lower arms"]
        }
    ]
    
    # If focuses were requested, restrict categories
    if requested_focuses:
        names_map = {
            "upper body": "Upper Body",
            "lower body": "Lower Body",
            "full body": "Full Body",
            "push": "Push",
            "pull": "Pull",
        }
        orig_len = len(focus_categories)
        focus_categories = [c for c in focus_categories if c["name"].lower() in {names_map.get(f, f) .lower() for f in requested_focuses} or c["name"].lower() in set(requested_focuses)]
        print(f"[Diverse-Exercises] Restricting categories by focus {requested_focuses}: {orig_len} -> {len(focus_categories)}")

    # Calculate exercises per category to ensure we get enough for 2000+ total
    # Increased the number of exercises per category for better variety
    target_exercises_per_category = max(200, limit // 3)  # Increased from 50 to 200 per category
    print(f"[Diverse-Exercises] DEBUG: limit={limit}, target_exercises_per_category={target_exercises_per_category}")
    all_exercises = []
    
    def normalize_list(res: Any) -> List[dict]:
        if isinstance(res, list):
            return res
        if isinstance(res, dict):
            # Handle the actual API response structure
            if isinstance(res.get("data"), list):
                return res["data"]
            if isinstance(res.get("results"), list):
                return res["results"]
            if isinstance(res.get("exercises"), list):
                return res["exercises"]
            # Check if it's an error response
            if res.get("error"):
                print(f"[normalize_list] Error in response: {res.get('error')}")
                return []
            # Look for any list in the response values
            for v in res.values():
                if isinstance(v, list):
                    return v
        return []

    def _gif(v: dict) -> Optional[str]:
        return v.get("gifUrl") or v.get("gif_url") or v.get("gifUrlTemplate")
    
    # Valid body part fallbacks for the external API (using correct API body part names)
    # Only these 10 body parts are supported: neck, lower arms, shoulders, cardio, upper arms, chest, lower legs, back, upper legs, waist
    fallback_bp_map = {
        "Upper Body": ["chest", "back", "shoulders", "upper arms", "lower arms", "neck"],
        "Lower Body": ["upper legs", "lower legs", "waist"],
        "Full Body": ["cardio", "back", "chest", "upper legs", "waist"],
        "Push": ["chest", "shoulders", "upper arms"],
        "Pull": ["back", "upper arms", "lower arms"],
    }

    # Load exercises from each focus category with optimized batching
    import asyncio
    
    # Batch categories to reduce API calls - process in smaller groups
    batch_size = 3  # Process 3 categories at a time for better performance
    category_batches = [focus_categories[i:i + batch_size] for i in range(0, len(focus_categories), batch_size)]
    
    async def load_category_batch(batch):
        """Load exercises for a batch of categories in parallel"""
        tasks = []
        for category in batch:
            task = load_single_category(category, target_exercises_per_category, filters, fallback_bp_map, exercise_client, call_mcp, normalize_list, _gif)
            tasks.append(task)
        
        # Execute all tasks in parallel for better performance
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Flatten results and handle exceptions
        all_results = []
        for result in batch_results:
            if isinstance(result, Exception):
                print(f"[Diverse-Exercises] Error in batch processing: {result}")
                continue
            if isinstance(result, list):
                all_results.extend(result)
        
        return all_results
    
    # Process batches with optimized parallel execution
    all_exercises = []
    for batch in category_batches:
        batch_results = await load_category_batch(batch)
        all_exercises.extend(batch_results)
        # Reduced delay for better performance
        await asyncio.sleep(0.05)
    
    # Fallback: if batched loading didn't get enough exercises, try individual loading
    if len(all_exercises) < 100:
        print("[Diverse-Exercises] Batched loading didn't get enough exercises, trying individual loading")
        for category in focus_categories:
            category_exercises = await load_single_category(category, target_exercises_per_category, filters, fallback_bp_map, exercise_client, call_mcp, normalize_list, _gif)
            all_exercises.extend(category_exercises)
    
    # Ensure per-focus minimums before shuffle/limit
    per_focus_min = max(50, target_exercises_per_category // 4)  # Ensure minimum 50 per category for better variety
    print(f"[Diverse-Exercises] DEBUG: per_focus_min={per_focus_min}")
    focus_to_items: dict[str, list] = {"Upper Body": [], "Lower Body": [], "Full Body": [], "Push": [], "Pull": []}
    for ex in all_exercises:
        f = ex.get("focus") or "Full Body"
        if f in focus_to_items:
            focus_to_items[f].append(ex)

    # Print focus distribution for debugging
    print(f"[Focus-Distribution] Before balancing:")
    for fc_name, items in focus_to_items.items():
        print(f"[Focus-Distribution] {fc_name}: {len(items)} exercises")

    # Try to top-up missing focuses using other already-fetched items of the same intent
    for fc_name, items in focus_to_items.items():
        if len(items) < per_focus_min:
            print(f"[Diverse-Exercises] DEBUG: {fc_name} has {len(items)} items, need {per_focus_min}, trying to borrow")
            # Try to borrow from Full Body or related groups
            pool = focus_to_items.get("Full Body", []) + all_exercises
            borrowed = 0
            for ex in pool:
                if len(items) >= per_focus_min:
                    break
                if ex in items:
                    continue
                # Re-check focus
                f2 = ex.get("focus")
                if fc_name in ("Upper Body", "Lower Body") and f2 in ("Full Body", fc_name):
                    items.append(ex)
                    borrowed += 1
                elif fc_name in ("Push", "Pull") and f2 in ("Full Body", fc_name):
                    items.append(ex)
                    borrowed += 1
            print(f"[Diverse-Exercises] DEBUG: {fc_name} borrowed {borrowed} exercises, now has {len(items)}")

    # Flatten respecting per-focus quotas, then fill remainder
    balanced: list[dict] = []
    for fc_name in ["Upper Body", "Lower Body", "Full Body", "Push", "Pull"]:
        # Get more exercises per focus category for better variety
        # Don't artificially limit - use all available exercises for each focus
        exercises_for_focus = len(focus_to_items.get(fc_name, []))
        print(f"[Diverse-Exercises] DEBUG: {fc_name} has {exercises_for_focus} exercises, adding all to balanced")
        balanced.extend(focus_to_items.get(fc_name, [])[:exercises_for_focus])

    # Deduplicate by exerciseId/name
    seen = set()
    deduped = []
    for ex in balanced + all_exercises:
        key = (ex.get("exerciseId"), ex.get("name"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ex)

    # Shuffle and limit the final results
    random.shuffle(deduped)
    print(f"[Diverse-Exercises] DEBUG: Before final limit: {len(deduped)} exercises, limit={limit}")
    final_exercises = deduped[:limit]
    print(f"[Diverse-Exercises] DEBUG: After final limit: {len(final_exercises)} exercises")
    
    # Print final focus distribution
    print(f"[Focus-Distribution] After processing:")
    final_focus_dist = {"Upper Body": 0, "Lower Body": 0, "Full Body": 0, "Push": 0, "Pull": 0}
    for ex in final_exercises:
        focus = ex.get("focus", "Full Body")
        if focus in final_focus_dist:
            final_focus_dist[focus] += 1
    for fc_name, count in final_focus_dist.items():
        print(f"[Focus-Distribution] {fc_name}: {count} exercises")
    
    print(f"[Diverse-Exercises] Returning {len(final_exercises)} exercises")
    for i, ex in enumerate(final_exercises[:5]):  # Show first 5 exercises
        print(f"[Diverse-Exercises] Exercise {i+1}: {ex['name']} - Focus: {ex['focus']}")
    
    # If we didn't get enough exercises from MCP, fallback to direct API calls
    if len(final_exercises) < limit:
        print(f"[Diverse-Exercises] Only got {len(final_exercises)} exercises, falling back to direct API calls")
        try:
            # Fallback to direct API calls to external ExerciseDB
            import httpx
            base_url = "https://workout-databaese.vercel.app/api/v1"
            
            # Get exercises from different body parts with comprehensive coverage
            # Only use valid API body parts: neck, lower arms, shoulders, cardio, upper arms, chest, lower legs, back, upper legs, waist
            body_parts = ["chest", "back", "shoulders", "upper arms", "upper legs", "cardio", "neck", "waist", "lower arms", "lower legs"]
            fallback_exercises = []
            
            # Calculate exercises per body part to reach target limit
            target_exercises = max(limit, 1000)  # Ensure minimum 1000 exercises for better variety
            exercises_per_bp = max(20, target_exercises // len(body_parts))  # Use smaller, more manageable limits
            
            for body_part in body_parts:
                if len(fallback_exercises) >= limit:
                    break
                    
                try:
                    async with httpx.AsyncClient(timeout=20) as client:
                        # Use correct body part names for the API
                        body_part_clean = body_part.lower().replace(" ", "%20")
                        
                        # Try multiple pages to get more exercises
                        for page in range(3):  # Try up to 3 pages
                            if len(fallback_exercises) >= limit:
                                break
                            offset = page * 20
                            r = await client.get(f"{base_url}/bodyparts/{body_part_clean}/exercises", params={"limit": 20, "offset": offset})
                            if r.status_code != 200:
                                print(f"API returned status {r.status_code} for {body_part} page {page}")
                                break
                            if r.status_code == 200:
                                data = r.json()
                                print(f"Fallback data for {body_part} page {page}: {type(data)}, success: {data.get('success', False)}")
                                
                                # Handle the actual API response structure
                                items = []
                                if isinstance(data, dict) and data.get("success") and "data" in data:
                                    items = data["data"]
                                elif isinstance(data, list):
                                    items = data
                                
                                print(f"Found {len(items)} exercises for {body_part} page {page}")
                                
                                for item in items:
                                    if len(fallback_exercises) >= limit:
                                        break
                                    if isinstance(item, dict) and item.get("gifUrl"):
                                        focus = determine_exercise_focus(
                                            item.get("targetMuscles") or [],
                                            item.get("bodyParts") or []
                                        )
                                        fallback_exercises.append({
                                            "exerciseId": item.get("exerciseId") or item.get("id") or str(hash(str(item))),
                                            "name": item.get("name") or "Unknown Exercise",
                                            "gifUrl": item.get("gifUrl"),
                                            "targetMuscles": item.get("targetMuscles") or [],
                                            "bodyParts": item.get("bodyParts") or [],
                                            "equipments": item.get("equipments") or [],
                                            "secondaryMuscles": item.get("secondaryMuscles") or [],
                                            "instructions": item.get("instructions") or [],
                                            "focus": focus,
                                        })
                                        print(f"Added fallback exercise: {item.get('name')} - Focus: {focus}")
                            else:
                                print(f"API returned status {r.status_code} for {body_part} page {page}")
                                break
                except Exception as e:
                    print(f"Error loading fallback exercises for {body_part}: {e}")
                    continue
            
            # If we still don't have enough exercises, try the general exercises endpoint
            if len(fallback_exercises) < 100:
                print(f"[Diverse-Exercises] Only got {len(fallback_exercises)} from body parts, trying general exercises endpoint")
                try:
                    async with httpx.AsyncClient(timeout=20) as general_client:
                        general_r = await general_client.get(f"{base_url}/exercises", params={"limit": min(limit - len(fallback_exercises), 100)})
                        if general_r.status_code == 200:
                            general_data = general_r.json()
                            if isinstance(general_data, dict) and "data" in general_data:
                                general_items = general_data["data"]
                                print(f"[Diverse-Exercises] Got {len(general_items)} exercises from general endpoint")
                                for item in general_items:
                                    if len(fallback_exercises) >= limit:
                                        break
                                    if isinstance(item, dict) and item.get("gifUrl"):
                                        focus = determine_exercise_focus(
                                            item.get("targetMuscles") or [],
                                            item.get("bodyParts") or []
                                        )
                                        fallback_exercises.append({
                                            "exerciseId": item.get("exerciseId") or item.get("id") or str(hash(str(item))),
                                            "name": item.get("name") or "Unknown Exercise",
                                            "gifUrl": item.get("gifUrl"),
                                            "targetMuscles": item.get("targetMuscles") or [],
                                            "bodyParts": item.get("bodyParts") or [],
                                            "equipments": item.get("equipments") or [],
                                            "secondaryMuscles": item.get("secondaryMuscles") or [],
                                            "instructions": item.get("instructions") or [],
                                            "focus": focus,
                                        })
                except Exception as e:
                    print(f"Error loading general exercises: {e}")
            
            # Add fallback exercises to final results
            final_exercises.extend(fallback_exercises[:limit - len(final_exercises)])
            print(f"[Diverse-Exercises] Added {len(fallback_exercises)} fallback exercises")
            
        except Exception as e:
            print(f"Error in fallback exercise loading: {e}")
    
    return {"approved_exercises": final_exercises}

# ----------------- AI Agent (core orchestration) -----------------------
async def run_groq_agent(user_id: str, mode: str = "assist") -> dict:
    """
    mode = "assist" → user uses drag & drop, AI filters exercises & assists
    mode = "ai" → AI generates full plan
    """

    # 1. Get user profile (from MCP server)
    user_profile = await call_mcp(user_client, "get_user_profile", {"user_id": user_id})
    if not user_profile or "error" in user_profile:
        raise HTTPException(status_code=400, detail="User profile not found")

    goal = user_profile.get("fitness_goal", "general fitness")
    level = user_profile.get("experience_level", "beginner")
    equipment = user_profile.get("equipment", [])

    # 2. Ask Groq LLM
    msg = [
        {"role": "system", "content": "You are a fitness AI agent that designs safe, effective workout plans."},
        {"role": "user", "content": f"""
        User profile: goal={goal}, level={level}, equipment={equipment}.
        Mode: {mode}.
        If assist mode → recommend exercises only (no plan).
        If ai mode → generate a full structured weekly workout plan (days + exercises).
        """}
    ]

    if not groq_client:
        raise HTTPException(status_code=500, detail="AI service not available")
    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=msg,
        tools=GROQ_TOOLS,
        tool_choice="auto"
    )

    reply = response.choices[0].message
    tool_calls = getattr(reply, "tool_calls", [])

    results = []
    for call in tool_calls or []:
        fn = call.function.name
        try:
            args = json.loads(call.function.arguments or "{}")
        except Exception:
            args = {}

        if fn.startswith("exercise-db"):
            res = await call_mcp(exercise_client, fn.split(".")[1], args)
        elif fn.startswith("user-profile"):
            res = await call_mcp(user_client, fn.split(".")[1], args)
        elif fn.startswith("workout-plan"):
            res = await call_mcp(plan_client, fn.split(".")[1], args)
        else:
            res = {"error": f"Unknown tool {fn}"}

        results.append({"tool": fn, "result": res})

    return {"reply": reply.content or "", "tool_results": results}
# -----------------------------------------------------------------------


# -------------------- FastAPI Endpoints -------------------------------
@router.post("/generate")
async def ai_generate_workout(user_id: str = Depends(get_current_user_id), mode: str = "assist"):
    """
    mode = assist → AI helps user build plan (filter + suggestions)
    mode = ai → AI generates full plan
    """
    # Persist AI toggle status in the user's workout plan document
    try:
        from app.database.connection import db
        from bson import ObjectId
        db.workout_plans.update_one({"user_id": ObjectId(user_id)}, {"$set": {"ai_enabled": mode == "ai", "updated_at": datetime.utcnow()}}, upsert=True)
    except Exception:
        pass
    result = await run_groq_agent(user_id, mode)
    return result


# Legacy compatibility: old clients call /ai/workout/generate-plan
@router.post("/generate-plan")
async def ai_generate_workout_legacy(user_id: str = Depends(get_current_user_id)):
    # Build a deterministic, DB-backed 5-day plan to ensure the UI always renders
    # 1) Get user profile details
    user_profile = await call_mcp(user_client, "get_user_profile", {"user_id": user_id})
    if not user_profile or user_profile.get("error"):
        user_profile = {}

    experience = str(user_profile.get("experience_level") or "beginner").lower()
    goal = str(user_profile.get("fitness_goal") or "maintain health").lower()
    equipment = user_profile.get("equipment") or []
    try:
        print("[AI-Plan] user:", {"experience": experience, "goal": goal, "equipment": equipment})
    except Exception:
        pass

    # Create a unique seed for this user and week to ensure variety
    today = datetime.utcnow().date()
    current_monday = today - timedelta(days=today.weekday())
    
    # Create a unique seed combining user_id, week, and current timestamp for maximum variety
    user_week_hash = hashlib.md5(f"{user_id}_{current_monday.strftime('%Y%m%d')}_{datetime.utcnow().timestamp()}".encode()).hexdigest()
    seed_value = int(user_week_hash[:8], 16)  # Use first 8 characters as integer
    random.seed(seed_value)
    
    try:
        print(f"[AI-Plan] Generated seed: {seed_value} for user {user_id} week {current_monday}")
    except Exception:
        pass

    # Load last saved plan and avoid repeating its exercises this week
    seen_names: set[str] = set()
    current_week_exercises: set[str] = set()  # Track exercises used in current week generation
    
    # Track exercises used in the last 2 weeks to ensure variety (reduced from 3 weeks)
    try:
        from bson import ObjectId
        q = {"user_id": ObjectId(user_id)}
        plan_doc = db.workout_plans.find_one(q)
        
        # Get current week's exercises (only from the most recent plan)
        last_week = (plan_doc or {}).get("week") or []
        for d in last_week:
            for ex in (d.get("exercises") or []):
                nm = str((ex.get("name") or "")).strip().lower()
                if nm:
                    seen_names.add(nm)
        
        # Only check for exercises used in the last 30 exercises (reduced from 100)
        # This allows for better variety while still avoiding recent duplicates
        history = (plan_doc or {}).get("exercise_history", [])
        for ex_name in history[-30:]:  # Reduced from 100 to 30 for better variety
            if ex_name:
                seen_names.add(str(ex_name).strip().lower())
                
        print(f"[AI-Plan] Loaded {len(seen_names)} previously used exercises from history")
                
    except Exception as e:
        print(f"[AI-Plan] Error loading exercise history: {e}")
        pass

    # 2) Define focuses and target muscles
    focuses = [
        ("Monday", "Upper Body", ["chest","back","shoulders","arms","triceps","biceps"], ["upper arms","shoulders","chest","back"]),
        ("Tuesday", "Lower Body", ["legs","glutes","hamstrings","quads","calves"], ["lower legs","upper legs","waist"]),
        ("Wednesday", "Full Body", ["full body","core","legs","back","chest"], ["waist","back","chest","cardio","upper legs","lower legs"]),
        ("Thursday", "Push", ["chest","shoulders","triceps"], ["chest","shoulders","upper arms"]),
        ("Friday", "Pull", ["back","biceps"], ["back","upper arms"]),
    ]

    def pick_reps_sets(level: str) -> Dict[str, Any]:
        if level in ("beginner", "sedentary"):
            return {"sets": 3, "reps": "8-12", "rest_seconds": 60}
        if level in ("advanced", "very active"):
            return {"sets": 4, "reps": "10-14", "rest_seconds": 75}
        return {"sets": 3, "reps": "10-12", "rest_seconds": 60}

    defaults = pick_reps_sets(experience)

    week: List[Dict[str, Any]] = []

    for day_name, focus, muscles, body_parts in focuses:
        def _gif(v: dict) -> Optional[str]:
            return v.get("gifUrl") or v.get("gif_url") or v.get("gifUrlTemplate")

        def normalize_list(res: Any) -> List[dict]:
            if isinstance(res, list):
                return res
            if isinstance(res, dict):
                # Handle the actual API response structure
                if isinstance(res.get("data"), list):
                    return res["data"]
                if isinstance(res.get("results"), list):
                    return res["results"]
                if isinstance(res.get("exercises"), list):
                    return res["exercises"]
                # Check if it's an error response
                if res.get("error"):
                    print(f"[normalize_list] Error in response: {res.get('error')}")
                    return []
                # Look for any list in the response values
                for v in res.values():
                    if isinstance(v, list):
                        return v
            return []

        def append_from(cands: List[dict], items: List[dict]) -> None:
            added_count = 0
            skipped_count = 0
            
            for r in cands:
                if len(items) >= 5:
                    break
                nm = str((r.get("name") or r.get("exercise_name") or "")).strip()
                if not nm:
                    continue
                low = nm.lower()
                
                # Check both historical exercises and current week exercises for uniqueness
                if low in seen_names or low in current_week_exercises:
                    skipped_count += 1
                    if skipped_count <= 3:  # Only log first 3 skipped exercises to avoid spam
                        print(f"[AI-Plan] Skipping '{nm}' - already used (seen_names: {low in seen_names}, current_week: {low in current_week_exercises})")
                    continue
                
                # For Lower Body day, add additional filtering to ensure we get actual lower body exercises
                if focus == "Lower Body":
                    # Check if the exercise name contains lower body keywords
                    lower_body_keywords = ['squat', 'lunge', 'leg', 'glute', 'hamstring', 'quad', 'calf', 'hip', 'thigh', 'deadlift', 'step', 'jump', 'run', 'walk', 'knee', 'ankle', 'foot', 'toe']
                    if not any(keyword in low for keyword in lower_body_keywords):
                        # If it's a fallback strategy, be more lenient
                        if strategy_attempts < 6:  # Only apply strict filtering for first 6 strategies
                            skipped_count += 1
                            if skipped_count <= 3:
                                print(f"[AI-Plan] Skipping '{nm}' - not a lower body exercise")
                            continue
                
                # Get gifUrl, but don't require it
                gif_url = _gif(r)
                if not gif_url:
                    # Use a placeholder if no gifUrl is available
                    gif_url = "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise"
                    try:
                        print(f"[AI-Plan] Exercise '{nm}' missing gifUrl, using placeholder")
                    except Exception:
                        pass
                
                items.append({
                    "exerciseId": r.get("exerciseId") or r.get("id") or r.get("_id") or nm[:12],
                    "name": nm,
                    "sets": defaults["sets"],
                    "reps": defaults["reps"],
                    "rest_seconds": defaults["rest_seconds"],
                    "notes": "",
                    "gifUrl": gif_url,
                })
                added_count += 1
                # Add to both sets to ensure uniqueness within the week
                seen_names.add(low)
                current_week_exercises.add(low)

            print(f"[AI-Plan] {day_name} append_from: {added_count} added, {skipped_count} skipped from {len(cands)} candidates")

        # Enhanced strategies with much larger pools and better fallback mechanisms
        strategies = []
        
        # Strategy 1: Primary focus with equipment (only if user has equipment)
        if equipment and len(equipment) > 0:
            p1 = {"muscles": muscles, "limit": 500, "offset": 0, "sortBy": "name", "sortOrder": "asc", "equipment": equipment}
            strategies.append(("primary+equip", p1))
        
        # Strategy 2: Body parts with equipment (only if user has equipment)
        if equipment and len(equipment) > 0:
            p2 = {"body_parts": body_parts, "limit": 500, "offset": 0, "sortBy": "name", "sortOrder": "asc", "equipment": equipment}
            strategies.append(("body+equip", p2))
        
        # Strategy 3: Primary focus without equipment filter (always try this)
        p3 = {"muscles": muscles, "limit": 1000, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
        strategies.append(("primary-no-equip", p3))
        
        # Strategy 4: Body parts without equipment filter (always try this)
        p4 = {"body_parts": body_parts, "limit": 1000, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
        strategies.append(("body-no-equip", p4))
        
        # Strategy 5: Broader muscle groups for variety (no equipment filter)
        # Only add related muscle groups, not generic upper body muscles
        if focus == "Lower Body":
            broad_muscles = list(set(muscles + ["legs", "glutes", "hamstrings", "quads", "calves", "adductors", "abductors", "hip flexors"]))
        elif focus == "Upper Body":
            broad_muscles = list(set(muscles + ["chest", "back", "shoulders", "arms", "triceps", "biceps", "forearms"]))
        elif focus == "Push":
            broad_muscles = list(set(muscles + ["chest", "shoulders", "triceps", "anterior deltoid", "lateral deltoid"]))
        elif focus == "Pull":
            broad_muscles = list(set(muscles + ["back", "biceps", "lats", "rhomboids", "traps", "rear deltoid"]))
        elif focus == "Full Body":
            broad_muscles = list(set(muscles + ["core", "abs", "full body", "functional", "compound"]))
        else:
            broad_muscles = muscles  # Don't add unrelated muscles
        
        strategies.append(("broad-muscles", {"muscles": broad_muscles, "limit": 1000, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        # Strategy 6: Equipment-specific exercises if equipment available
        if equipment and len(equipment) > 0:
            strategies.append(("equipment-specific", {"equipment": equipment, "limit": 800, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        # Strategy 7: Fallback to general exercises with much larger pool
        strategies.append(("fallback", {"limit": 1500, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        # Strategy 8: For Lower Body, add a specific search-based fallback
        if focus == "Lower Body":
            strategies.append(("lower-body-search", {"search": "squat lunge leg glute hamstring quad calf", "limit": 500, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        # Strategy 9: Ultimate fallback - get any exercises available
        strategies.append(("ultimate-fallback", {"limit": 2000, "offset": 0}))

        items: List[dict] = []
        strategy_attempts = 0
        max_strategy_attempts = 4  # Try first 4 strategies before allowing duplicates
        
        for label, params in strategies:
            strategy_attempts += 1
            print(f"[AI-Plan] {day_name} strategy={label} params=", params)
            res = await call_mcp(exercise_client, "filter_exercises", params)
            cands = normalize_list(res)
            
            # Apply random offset to get different exercises each time
            if cands and len(cands) > 50:
                offset = random.randint(0, min(len(cands) - 50, 200))
                cands = cands[offset:offset + 200]  # Increased from 150 to 200
            
            # Shuffle to ensure variety within the week and across weeks
            try:
                random.shuffle(cands)
            except Exception:
                pass
            
            print(f"[AI-Plan] {day_name} strategy={label} candidates=", len(cands))
            
            # Process candidates through append_from
            append_from(cands, items)
            
            # If we've tried several strategies and still don't have enough exercises,
            # be more lenient with uniqueness filtering
            if strategy_attempts > max_strategy_attempts and len(items) < 3:
                print(f"[AI-Plan] {day_name} Strategy {strategy_attempts}: Being more lenient with uniqueness filtering")
                # Temporarily clear current_week_exercises to allow some overlap
                temp_current_week = current_week_exercises.copy()
                current_week_exercises.clear()
                # Try again with more lenient filtering
                append_from(cands, items)
                # Restore current_week_exercises
                current_week_exercises.update(temp_current_week)
            
            # Continue until we have at least 5 exercises, regardless of gifUrl
            if len(items) >= 5:
                break
        
        # If we still don't have enough exercises, try a direct fallback approach
        if len(items) < 5:
            print(f"[AI-Plan] {day_name} Only got {len(items)} exercises, trying direct fallback...")
            try:
                # Try to get any exercises from the database without filters
                fallback_res = await call_mcp(exercise_client, "filter_exercises", {
                    "limit": 1000,
                    "offset": random.randint(0, 500),
                    "sortBy": "name",
                    "sortOrder": "asc"
                })
                fallback_cands = normalize_list(fallback_res)
                
                if fallback_cands:
                    # Shuffle and take what we need
                    random.shuffle(fallback_cands)
                    print(f"[AI-Plan] {day_name} Fallback found {len(fallback_cands)} exercises")
                    
                    # If we still don't have enough, clear uniqueness filters entirely
                    if len(items) < 3:
                        print(f"[AI-Plan] {day_name} Clearing uniqueness filters for emergency fallback")
                        temp_seen = seen_names.copy()
                        temp_current = current_week_exercises.copy()
                        seen_names.clear()
                        current_week_exercises.clear()
                        append_from(fallback_cands, items)
                        # Restore filters
                        seen_names.update(temp_seen)
                        current_week_exercises.update(temp_current)
                    else:
                        append_from(fallback_cands, items)
                    
            except Exception as e:
                print(f"[AI-Plan] {day_name} Fallback failed: {e}")
        
        # Final check - if we still don't have enough, create placeholder exercises
        if len(items) < 5:
            print(f"[AI-Plan] {day_name} Still only {len(items)} exercises, creating placeholders...")
            placeholder_exercises = [
                {"name": f"Basic {focus} Exercise 1", "targetMuscles": muscles, "bodyParts": body_parts},
                {"name": f"Basic {focus} Exercise 2", "targetMuscles": muscles, "bodyParts": body_parts},
                {"name": f"Basic {focus} Exercise 3", "targetMuscles": muscles, "bodyParts": body_parts},
                {"name": f"Basic {focus} Exercise 4", "targetMuscles": muscles, "bodyParts": body_parts},
                {"name": f"Basic {focus} Exercise 5", "targetMuscles": muscles, "bodyParts": body_parts},
            ]
            
            for i, placeholder in enumerate(placeholder_exercises):
                if len(items) >= 5:
                    break
                nm = placeholder["name"]
                if nm.lower() not in seen_names and nm.lower() not in current_week_exercises:
                    items.append({
                        "exerciseId": f"placeholder_{i}_{day_name.lower()}",
                        "name": nm,
                        "sets": defaults["sets"],
                        "reps": defaults["reps"],
                        "rest_seconds": defaults["rest_seconds"],
                        "notes": "AI-generated exercise",
                        "gifUrl": "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise",
                    })
                    seen_names.add(nm.lower())
                    current_week_exercises.add(nm.lower())

        # Final filter: prioritize exercises with gifUrl, but don't exclude those without
        with_gif = [ex for ex in items if ex.get("gifUrl")]
        without_gif = [ex for ex in items if not ex.get("gifUrl")]
        
        # If we have enough exercises with gifUrl, use them; otherwise include all
        if len(with_gif) >= 3:
            items = with_gif[:5]
        else:
            # Combine exercises with gifUrl first, then add those without
            items = with_gif + without_gif[:5-len(with_gif)]
        
        # Final validation: ensure we have exactly 5 exercises
        if len(items) < 5:
            print(f"[AI-Plan] WARNING: {day_name} only has {len(items)} exercises, this should not happen!")
            # This should not happen with our fallback mechanisms, but just in case
            while len(items) < 5:
                items.append({
                    "exerciseId": f"emergency_{len(items)}_{day_name.lower()}",
                    "name": f"Emergency {focus} Exercise {len(items) + 1}",
                    "sets": defaults["sets"],
                    "reps": defaults["reps"],
                    "rest_seconds": defaults["rest_seconds"],
                    "notes": "Emergency fallback exercise",
                    "gifUrl": "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise",
                })
        
        try:
            print(f"[AI-Plan] {day_name} final items=", len(items), "names=", [i["name"] for i in items])
            # Debug: Check gifUrl presence in final items
            for i, item in enumerate(items):
                if not item.get("gifUrl"):
                    print(f"[AI-Plan] INFO: {day_name} item {i} '{item.get('name')}' missing gifUrl (using placeholder)")
                    # Add a placeholder gifUrl for exercises without one
                    if not item.get("gifUrl"):
                        item["gifUrl"] = "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise"
                else:
                    print(f"[AI-Plan] {day_name} item {i} '{item.get('name')}' has gifUrl: {item.get('gifUrl')[:50]}...")
        except Exception:
            pass

        week.append({
            "day": day_name,
            "focus": focus,
            "exercises": items,
        })

    try:
        print("[AI-Plan] week exercise totals:", [len(d.get("exercises", [])) for d in week])
        # Debug: Check gifUrl presence in final week structure
        for day_idx, day in enumerate(week):
            print(f"[AI-Plan] Day {day_idx} ({day.get('day')}): {len(day.get('exercises', []))} exercises")
            for ex_idx, ex in enumerate(day.get("exercises", [])):
                if not ex.get("gifUrl"):
                    print(f"[AI-Plan] WARNING: Day {day_idx} exercise {ex_idx} '{ex.get('name')}' missing gifUrl")
                else:
                    print(f"[AI-Plan] Day {day_idx} exercise {ex_idx} '{ex.get('name')}' has gifUrl: {ex.get('gifUrl')[:50]}...")
    except Exception:
        pass
    
    # Update exercise history to track used exercises for future variety
    try:
        exercise_names = []
        for day in week:
            for exercise in day.get("exercises", []):
                name = exercise.get("name", "").strip()
                if name:
                    exercise_names.append(name)
        
        # Update the workout plan with new exercise history
        if exercise_names:
            from bson import ObjectId
            db.workout_plans.update_one(
                {"user_id": ObjectId(user_id)},
                {
                    "$push": {"exercise_history": {"$each": exercise_names}},
                    "$set": {"updated_at": datetime.utcnow()}
                },
                upsert=True
            )
            
            # Keep only last 100 exercises in history to prevent bloat
            db.workout_plans.update_one(
                {"user_id": ObjectId(user_id)},
                {"$set": {"exercise_history": exercise_names[-100:]}}
            )
    except Exception as e:
        print(f"[AI-Plan] Failed to update exercise history: {e}")
        pass
    
    summary = f"AI generated a {experience} plan for goal '{goal}'."
    return {"week": week, "summary": summary}

async def _apply_user_profile_filters(exercises: list, user_id: str) -> list:
    """Apply user health and workout profile filters to exercises."""
    try:
        # The user_id is actually the user's ObjectId as a string
        # Convert string to ObjectId for database queries
        from bson import ObjectId
        user_object_id = ObjectId(user_id)
        
        # Get user document
        user = db.users.find_one({"_id": user_object_id})
        
        if not user:
            print(f"[Profile-Filter] No user found for ObjectId {user_id}, returning all exercises")
            return exercises
        
        # Get user's workout profile from workout_profiles collection
        workout_profile = db.workout_profiles.find_one({"user_id": user_object_id})
        
        if not workout_profile:
            print(f"[Profile-Filter] No workout profile found for user {user_id}, returning all exercises")
            return exercises
        
        filtered_exercises = []
        
        # Get user preferences and limitations from workout profile
        fitness_level = workout_profile.get("experience_level", "intermediate").lower()
        available_equipment = workout_profile.get("equipment", [])
        custom_equipment = workout_profile.get("custom_equipment", [])
        
        # Get health conditions and goals from user's onboarding data
        health_conditions = []
        workout_goals = []
        if user.get("onboarding", {}).get("step2", {}):
            health_conditions = user["onboarding"]["step2"].get("medical_conditions", [])
            workout_goals = user["onboarding"]["step2"].get("fitness_goals", [])
        
        # Combine equipment lists
        all_equipment = available_equipment + custom_equipment
        
        print(f"[Profile-Filter] User profile - Level: {fitness_level}, Health: {health_conditions}, Equipment: {all_equipment}, Goals: {workout_goals}")
        
        for exercise in exercises:
            # More lenient equipment filtering - only exclude if user has equipment but exercise requires specific equipment they don't have
            if len(all_equipment) > 0:
                required_equipment = exercise.get("equipments", [])
                if required_equipment:
                    # Convert to lowercase for comparison
                    available_lower = [eq.lower() for eq in all_equipment]
                    required_lower = [eq.lower() for eq in required_equipment]
                    
                    # Check if any required equipment is available or if it's bodyweight
                    has_equipment = any(
                        req in available_lower or 
                        'body weight' in req.lower() or 
                        'bodyweight' in req.lower() or
                        'none' in req.lower() or
                        'no equipment' in req.lower()
                        for req in required_lower
                    )
                    
                    # Only exclude if it requires specific equipment the user doesn't have AND it's not bodyweight
                    if not has_equipment and not any('body' in req.lower() for req in required_lower):
                        continue
            
            # Filter based on fitness level
            exercise_name = exercise.get("name", "").lower()
            if fitness_level == "beginner":
                # Exclude advanced exercises for beginners
                if any(advanced_term in exercise_name for advanced_term in ["advanced", "plyo", "explosive", "olympic", "complex", "muscle up"]):
                    continue
            elif fitness_level == "advanced":
                # Prioritize more challenging exercises for advanced users
                pass  # Include all exercises
            
            # Filter based on health conditions
            skip_exercise = False
            for condition in health_conditions:
                condition_lower = condition.lower()
                if "back" in condition_lower and any(term in exercise_name for term in ["deadlift", "back extension", "hyperextension"]):
                    skip_exercise = True
                    break
                elif "knee" in condition_lower and any(term in exercise_name for term in ["jump", "squat", "lunge"]):
                    skip_exercise = True
                    break
                elif "shoulder" in condition_lower and any(term in exercise_name for term in ["overhead", "shoulder press", "lateral raise"]):
                    skip_exercise = True
                    break
            
            if skip_exercise:
                continue
            
            # Add focus-based scoring for workout goals
            exercise_focus = exercise.get("focus", "")
            score = 1.0
            
            for goal in workout_goals:
                goal_lower = goal.lower()
                if "strength" in goal_lower and exercise_focus in ["Push", "Pull"]:
                    score += 0.3
                elif "cardio" in goal_lower and exercise_focus == "Full Body":
                    score += 0.3
                elif "muscle" in goal_lower and exercise_focus in ["Upper Body", "Lower Body"]:
                    score += 0.3
            
            exercise["profile_score"] = score
            filtered_exercises.append(exercise)
        
        # Sort by profile score (higher is better)
        filtered_exercises.sort(key=lambda x: x.get("profile_score", 1.0), reverse=True)
        
        print(f"[Profile-Filter] Filtered from {len(exercises)} to {len(filtered_exercises)} exercises")
        return filtered_exercises
        
    except Exception as e:
        print(f"[Profile-Filter] Error applying profile filters: {e}")
        return exercises

@cache_result(expiry_seconds=1800)  # Cache for 30 minutes for better performance
@router.post("/filter-library")
async def ai_filter_library(payload: dict, user_id: str = Depends(get_current_user_id)):
    """
    Filter the full exercise library via Exercise MCP and return normalized results with caching.
    Payload: { filters: { muscles?:[], body_parts?:[], equipment?:[], search?: string, focus?: string, focuses?: string[] }, limit?: number, focus?: string, focuses?: string[] }
    Response: { approved_exercises: ExerciseOut[], reason?: string }
    """
    filters = payload.get("filters") or {}
    # Accept focus/focuses from either root or filters
    if payload.get("focus") and not filters.get("focus"):
        filters["focus"] = payload.get("focus")
    if payload.get("focuses") and not filters.get("focuses"):
        filters["focuses"] = payload.get("focuses")
    limit = int(payload.get("limit") or 100)
    offset = int(payload.get("offset") or 0)

    print(f"[Filter-Library] DEBUG: Received payload: {payload}")
    print(f"[Filter-Library] DEBUG: Received filters: {filters}, limit: {limit}")

    # Get diverse exercises with an internal limit that covers the requested page window
    # Ensure we fetch at least offset+limit items (capped for safety)
    # Build a large stable pool once per request (sliced below). This avoids window-capping totals.
    # Keep within safe bounds.
    internal_limit = min(2000, max(1500, limit * 50))
    print(f"[Filter-Library] DEBUG: internal_limit for fetch: {internal_limit} (offset={offset}, limit={limit})")
    result = await _get_diverse_exercises(internal_limit, filters)
    
    # Apply user profile filtering
    if result and "approved_exercises" in result:
        # Apply strict server-side filters first
        strict_filters = {}
        if filters.get("muscles"):
            strict_filters["muscles"] = filters["muscles"]
        if filters.get("body_parts"):
            strict_filters["body_parts"] = filters["body_parts"]
        if filters.get("equipment"):
            strict_filters["equipment"] = filters["equipment"]
        if filters.get("search"):
            strict_filters["search"] = filters["search"]
        
        print(f"[Filter-Library] Applying strict server-side filters: {strict_filters}")
        exercises_to_filter = result["approved_exercises"]
        
        # Normalize and apply focus filter first (if provided)
        focus_raw = str(filters.get("focus") or "").strip().lower()
        focuses_raw = filters.get("focuses") if isinstance(filters.get("focuses"), list) else []
        requested_focuses: list[str] = []
        if focus_raw:
            requested_focuses.append(focus_raw)
        requested_focuses += [f for f in focuses_raw if isinstance(f, str)]
        if requested_focuses:
            fmap = {
                "upper-body": "upper body",
                "upper body": "upper body",
                "upperbody": "upper body",
                "lower-body": "lower body",
                "lower body": "lower body",
                "lowerbody": "lower body",
                "full-body": "full body",
                "full body": "full body",
                "fullbody": "full body",
                "push": "push",
                "pull": "pull",
            }
            norm_set = {fmap.get(str(f).lower().strip(), str(f).lower().strip()) for f in requested_focuses}
            before = len(exercises_to_filter)
            filtered_focus = []
            for ex in exercises_to_filter:
                nf = _normalize_exercise_fields(ex)
                if nf["focus"] in norm_set:
                    # also persist normalized focus back on object
                    ex["focus"] = nf["focus"].title() if nf["focus"] != "push" and nf["focus"] != "pull" else nf["focus"].capitalize()
                    filtered_focus.append(ex)
            exercises_to_filter = filtered_focus
            print(f"[Filter-Library] Applied focus filter set {sorted(list(norm_set))}: {before} -> {len(exercises_to_filter)}")
        
        if strict_filters:
            filtered_by_strict_filters = []
            for ex in exercises_to_filter:
                nf = _normalize_exercise_fields(ex)
                match = True
                for key, value in strict_filters.items():
                    if key == "muscles":
                        vals = [str(v).lower().strip() for v in value]
                        if not any(v in nf["target_muscles"] for v in vals):
                            match = False
                            break
                    elif key == "body_parts":
                        vals = [str(v).lower().strip() for v in value]
                        if not any(v in nf["body_parts"] for v in vals):
                            match = False
                            break
                    elif key == "equipment":
                        vals = [str(v).lower().strip() for v in value]
                        if not any(v in nf["equipments"] for v in vals):
                            match = False
                            break
                    elif key == "search":
                        if value and str(value).lower().strip() not in nf["name"].lower():
                            match = False
                            break
                if match:
                    filtered_by_strict_filters.append(ex)
            exercises_to_filter = filtered_by_strict_filters
            print(f"[Filter-Library] Exercises after strict server-side filter: {len(exercises_to_filter)}")

        # Apply user profile filtering
        filtered_exercises = await _apply_user_profile_filters(exercises_to_filter, user_id)
        
        # Paginate deterministically using offset and limit
        # Ensure deterministic sort for consistent pagination
        try:
            filtered_exercises.sort(key=lambda x: (str(x.get('name','')).lower(), str(x.get('exerciseId') or x.get('id') or '')))
        except Exception:
            pass
        total = len(filtered_exercises)
        start = max(0, min(offset, total))
        end = max(start, min(start + limit, total))
        page_items = filtered_exercises[start:end]
        result["approved_exercises"] = page_items
        # Determine if more exist strictly by total vs end
        has_more = end < total
        result["metadata"] = {
            **(result.get("metadata") or {}),
            "total": total,
            "offset": start,
            "limit": limit,
            "has_more": has_more
        }
        print(f"[Filter-Library] Final page: {len(page_items)} of total {total} (offset={start}, limit={limit})")
        return result
    
    return result


# ----------------- Alternative Exercise Suggestions -----------------

@router.post("/skip")
@router.post("/suggest-alternative")  # Add direct route for better compatibility
async def ai_suggest_alternative(payload: dict, user_id: str = Depends(get_current_user_id)):
    """
    Suggest alternatives using Exercise MCP, not free-form LLM text.
    Payload = { "skipped_exercise": str, "reason": str, "context": {"muscles":[], "body_parts":[], "equipment":[] } }
    """
    try:
        print(f"[Suggest-Alternative] Received payload: {payload}")
        skipped = payload.get("skipped_exercise")
        skipped_name = ""
        context = payload.get("context") or {}
        reason = payload.get("reason", "User chose to skip this exercise")
        
        # Accept either string name or exercise object
        if isinstance(skipped, str):
            skipped_name = skipped.strip().lower()
            print(f"[Suggest-Alternative] Skipped exercise (string): {skipped_name}")
        elif isinstance(skipped, dict):
            skipped_name = str((skipped.get("name") or "")).strip().lower()
            print(f"[Suggest-Alternative] Skipped exercise (object): {skipped_name}")
            # Derive context from object if not provided
            context.setdefault("muscles", skipped.get("targetMuscles") or skipped.get("target") or [])
            bp = skipped.get("bodyParts") or []
            if not bp and isinstance(skipped.get("bodyPart"), str):
                bp = [skipped.get("bodyPart")]
            context.setdefault("body_parts", bp)
            eq = skipped.get("equipments") or []
            if not eq and isinstance(skipped.get("equipment"), str):
                eq = [skipped.get("equipment")]
            context.setdefault("equipment", eq)
        else:
            print(f"[Suggest-Alternative] Invalid skipped exercise format: {type(skipped)}")
            return {"alternatives": [], "rationale": "Invalid exercise format"}
            
        muscles = context.get("muscles") or []
        body_parts = context.get("body_parts") or []
        equipment = context.get("equipment") or []
        
        print(f"[Suggest-Alternative] Context - muscles: {muscles}, body_parts: {body_parts}, equipment: {equipment}")

        # Pull current and previous plan to avoid recommending duplicates
        exclude_names: set[str] = set()
        if skipped_name:
            exclude_names.add(skipped_name)
        try:
            from bson import ObjectId
            q = {"user_id": ObjectId(user_id)}
            plan_doc = db.workout_plans.find_one(q)
            
            # Exclude current week's exercises
            for d in (plan_doc or {}).get("week", []) or []:
                for ex in d.get("exercises", []) or []:
                    nm = str(ex.get("name") or "").strip().lower()
                    if nm:
                        exclude_names.add(nm)
            
            # Also exclude recently used exercises from history
            history = (plan_doc or {}).get("exercise_history", [])
            for ex_name in history[-30:]:  # Last 30 exercises used
                if ex_name:
                    exclude_names.add(str(ex_name).strip().lower())
                    
        except Exception:
            pass

        # Build enhanced filtering strategies for better variety
        strategies: List[Dict[str, Any]] = []
        
        # Strategy 1: Primary focus with equipment (if available)
        if muscles:
            p = {"muscles": muscles, "limit": 200, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
            if equipment and len(equipment) > 0:
                p["equipment"] = equipment
            strategies.append(("primary-muscles", p))
        
        # Strategy 2: Body parts with equipment (if available)
        if body_parts:
            p = {"body_parts": body_parts, "limit": 200, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
            if equipment and len(equipment) > 0:
                p["equipment"] = equipment
            strategies.append(("primary-body-parts", p))
        
        # Strategy 3: Primary focus without equipment filter (always try this)
        if muscles:
            p = {"muscles": muscles, "limit": 300, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
            strategies.append(("primary-no-equip", p))
        
        # Strategy 4: Body parts without equipment filter (always try this)
        if body_parts:
            p = {"body_parts": body_parts, "limit": 300, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
            strategies.append(("body-parts-no-equip", p))
        
        # Strategy 5: Broader muscle groups for variety
        if muscles:
            broad_muscles = list(set(muscles + ["full body", "core", "legs", "back", "chest", "arms", "shoulders", "triceps", "biceps"]))
            p = {"muscles": broad_muscles, "limit": 400, "offset": 0, "sortBy": "name", "sortOrder": "asc"}
            strategies.append(("broad-muscles", p))
        
        # Strategy 6: Equipment-specific if available
        if equipment and len(equipment) > 0:
            strategies.append(("equipment-specific", {"equipment": equipment, "limit": 250, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        # Strategy 7: Fallback to general exercises
        strategies.append(("general-fallback", {"limit": 500, "offset": 0, "sortBy": "name", "sortOrder": "asc"}))
        
        print(f"[Suggest-Alternative] Built {len(strategies)} strategies: {[s[0] for s in strategies]}")

        def normalize_list(res: Any) -> List[dict]:
            if isinstance(res, list):
                return res
            if isinstance(res, dict):
                # Handle the actual API response structure
                if isinstance(res.get("data"), list):
                    return res["data"]
                if isinstance(res.get("results"), list):
                    return res["results"]
                if isinstance(res.get("exercises"), list):
                    return res["exercises"]
                # Check if it's an error response
                if res.get("error"):
                    print(f"[normalize_list] Error in response: {res.get('error')}")
                    return []
                # Look for any list in the response values
                for v in res.values():
                    if isinstance(v, list):
                        return v
            return []

        def _gif(v: dict) -> Optional[str]:
            return v.get("gifUrl") or v.get("gif_url") or v.get("gifUrlTemplate")

        candidates: List[dict] = []
        strategy_attempts = 0
        max_attempts = 5  # Try first 5 strategies before being more lenient
        
        # Create a unique seed for this suggestion request to ensure variety
        suggestion_seed = int(hashlib.md5(f"{user_id}_{skipped_name}_{datetime.utcnow().timestamp()}".encode()).hexdigest()[:8], 16)
        local_random = random.Random(suggestion_seed)
        print(f"[Suggest-Alternative] Using suggestion seed: {suggestion_seed}")
        
        # Shuffle strategies to ensure different order each time
        local_random.shuffle(strategies)
        print(f"[Suggest-Alternative] Shuffled strategy order: {[s[0] for s in strategies]}")
        
        for strategy_name, p in strategies:
            strategy_attempts += 1
            print(f"[Suggest-Alternative] Trying strategy {strategy_attempts}: {strategy_name}")
            
            # Add random offset to the API call itself for better variety
            if "offset" not in p:
                p["offset"] = local_random.randint(0, 500)
            else:
                p["offset"] = local_random.randint(0, 500)
            
            res = await call_mcp(exercise_client, "filter_exercises", p)
            lst = normalize_list(res)
            print(f"[Suggest-Alternative] Strategy {strategy_name} returned {len(lst)} exercises")
            
            # Apply additional random offset to get different exercises each time
            if lst and len(lst) > 20:
                offset = local_random.randint(0, min(len(lst) - 20, 300))  # Increased range
                lst = lst[offset:offset + 200]  # Increased sample size
            
            try:
                local_random.shuffle(lst)
            except Exception:
                pass
            
            added_from_strategy = 0
            skipped_from_strategy = 0
            
            for r in lst:
                if len(candidates) >= 6:
                    break
                    
                nm = str((r.get("name") or r.get("exercise_name") or "")).strip()
                if not nm:
                    continue
                low = nm.lower()
                if low in exclude_names:
                    skipped_from_strategy += 1
                    continue
                    
                gif = _gif(r)
                if not gif:
                    # Don't require gifUrl for alternatives - use placeholder if needed
                    gif = "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise"
                
                target_muscles = r.get("targetMuscles") or r.get("target") or []
                if isinstance(target_muscles, str):
                    target_muscles = [target_muscles]
                body_parts_norm = r.get("bodyParts") or []
                if not body_parts_norm and isinstance(r.get("bodyPart"), str):
                    body_parts_norm = [r.get("bodyPart")]
                equipments = r.get("equipments") or []
                if not equipments and isinstance(r.get("equipment"), str):
                    equipments = [r.get("equipment")]
                secondary = r.get("secondaryMuscles") or []
                instructions = r.get("instructions") or []
                
                candidates.append({
                    "exerciseId": r.get("exerciseId") or r.get("id") or r.get("_id") or nm[:12],
                    "name": nm,
                    "gifUrl": gif,
                    "targetMuscles": target_muscles,
                    "bodyParts": body_parts_norm,
                    "equipments": equipments,
                    "secondaryMuscles": secondary,
                    "instructions": instructions,
                })
                added_from_strategy += 1
                exclude_names.add(low)  # Add to exclude list to avoid duplicates
            
            print(f"[Suggest-Alternative] Strategy {strategy_name}: {added_from_strategy} added, {skipped_from_strategy} skipped")
            
            # If we have enough candidates, break
            if len(candidates) >= 3:
                    break
                
            # If we've tried several strategies and still don't have enough, be more lenient
            if strategy_attempts >= max_attempts and len(candidates) < 2:
                print(f"[Suggest-Alternative] Strategy {strategy_attempts}: Being more lenient with exclusions")
                # Clear some exclusions to allow more variety
                temp_exclude = exclude_names.copy()
                # Keep only the most recent exclusions and the skipped exercise
                exclude_list = list(temp_exclude)
                exclude_names.clear()
                exclude_names.add(skipped_name)  # Always exclude the skipped exercise
                exclude_names.update(exclude_list[-5:])  # Only exclude last 5 exercises
                print(f"[Suggest-Alternative] Reduced exclusions from {len(temp_exclude)} to {len(exclude_names)}")

        # Final fallback: if we still don't have enough alternatives, try emergency fallback
        if len(candidates) < 3:
            print(f"[Suggest-Alternative] Only found {len(candidates)} alternatives, trying emergency fallback...")
            try:
                # Try to get any exercises without any filters
                emergency_res = await call_mcp(exercise_client, "filter_exercises", {
                    "limit": 200,
                    "offset": local_random.randint(0, 500),
                    "sortBy": "name",
                    "sortOrder": "asc"
                })
                emergency_lst = normalize_list(emergency_res)
                
                if emergency_lst:
                    local_random.shuffle(emergency_lst)
                    for r in emergency_lst:
                        if len(candidates) >= 3:
                            break
                        nm = str((r.get("name") or r.get("exercise_name") or "")).strip()
                        if not nm or nm.lower() in exclude_names:
                            continue
                        
                        gif = _gif(r) or "https://via.placeholder.com/300x300/4A5568/FFFFFF?text=Exercise"
                        candidates.append({
                            "exerciseId": r.get("exerciseId") or r.get("id") or r.get("_id") or nm[:12],
                            "name": nm,
                            "gifUrl": gif,
                            "targetMuscles": r.get("targetMuscles") or r.get("target") or [],
                            "bodyParts": r.get("bodyParts") or [],
                            "equipments": r.get("equipments") or [],
                            "secondaryMuscles": r.get("secondaryMuscles") or [],
                            "instructions": r.get("instructions") or [],
                        })
                    print(f"[Suggest-Alternative] Emergency fallback added {len(candidates)} total alternatives")
            except Exception as emergency_error:
                print(f"[Suggest-Alternative] Emergency fallback failed: {emergency_error}")

        print(f"[Suggest-Alternative] Final result: {len(candidates)} alternatives found")
        return {"alternatives": candidates[:3], "rationale": f"Found {len(candidates)} alternatives for {skipped_name}"}
    except Exception as e:
        print(f"[Suggest-Alternative] Error: {e}")
        # Ensure UI never blacks out
        return {"alternatives": [], "rationale": f"Could not fetch alternatives: {str(e)}"}


# Legacy compatibility: alias to previous route name
@router.post("/suggest-alternative")
async def ai_suggest_alternative_legacy(payload: dict, user_id: str = Depends(get_current_user_id)):
    try:
        return await ai_suggest_alternative(payload, user_id)
    except HTTPException as e:
        # Don't propagate as 500 to UI; return empty structured response
        if e.status_code >= 500:
            return {"alternatives": [], "rationale": "AI service temporarily unavailable."}
        raise
# -----------------------------------------------------------------------
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    