from fastapi import APIRouter, HTTPException, Query
import httpx
import os
import random

router = APIRouter(prefix="/exercises", tags=["Exercises"])
BASE_URL = os.getenv("EXERCISEDB_BASE_URL", "https://workout-databaese.vercel.app/api/v1")

async def get_diverse_exercises_local(limit: int, offset: int = 0):
    """Get diverse exercises from different body parts for better variety"""
    # Define different body parts to get variety
    body_parts = ["chest", "back", "shoulders", "arms", "legs", "glutes", "core", "cardio"]
    exercises_per_part = max(1, limit // len(body_parts))
    all_exercises = []
    
    for body_part in body_parts:
        try:
            url = f"{BASE_URL}/bodyparts/{body_part}/exercises"
            params = {"limit": exercises_per_part * 2}  # Get more to account for filtering
            
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(url, params=params)
            
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    # Take only the first few exercises from this body part
                    part_exercises = data[:exercises_per_part]
                    all_exercises.extend(part_exercises)
                elif isinstance(data, dict) and "data" in data:
                    part_exercises = data["data"][:exercises_per_part]
                    all_exercises.extend(part_exercises)
        except Exception as e:
            print(f"Error loading exercises for body part {body_part}: {e}")
            continue
    
    # If we didn't get enough exercises, try the general exercises endpoint
    if len(all_exercises) < limit:
        try:
            url = f"{BASE_URL}/exercises"
            params = {"limit": limit - len(all_exercises)}
            
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(url, params=params)
            
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    all_exercises.extend(data)
                elif isinstance(data, dict) and "data" in data:
                    all_exercises.extend(data["data"])
        except Exception as e:
            print(f"Error loading general exercises: {e}")
    
    # Normalize and shuffle the exercises
    normalized = []
    # Apply offset/limit over the assembled list for deterministic pagination
    sliced = all_exercises[offset: offset + limit] if offset or limit else all_exercises
    for item in sliced:
        if isinstance(item, dict):
            normalized.append({
                "id": item.get("exerciseId") or item.get("id") or item.get("_id") or item.get("uuid") or str(hash(str(item))),
                "name": item.get("name") or "Unknown Exercise",
                "gifUrl": item.get("gifUrl") or item.get("gif_url") or item.get("gifUrlTemplate") or "",
                "target": item.get("targetMuscles") or item.get("target") or "",
                "equipment": item.get("equipments") or item.get("equipment") or "",
                "bodyPart": item.get("bodyParts") or item.get("bodyPart") or "",
                "secondaryMuscles": item.get("secondaryMuscles") or [],
                "instructions": item.get("instructions") or []
            })
    
    # For pagination stability, only shuffle when offset is 0; keep order stable across pages
    if offset == 0:
        random.shuffle(normalized)
    
    return {
        "items": normalized,
        "offset": offset,
        "limit": limit,
        "metadata": {"diverse": True}
    }

@router.get("")
async def list_exercises(
    offset: int = Query(0, description="offset for pagination"),
    limit: int = Query(20, description="limit for pagination"),
    search: str = Query("", description="search term"),
    q: str = Query("", description="search query (alias for search)"),
    category: str = Query("", description="filter by category"),
    bodyPart: str = Query("", description="filter by body part"),
    target: str = Query("", description="filter by target muscle"),
    page: int = Query(1, description="page number for pagination")
):
    """Get all exercises with optional pagination & search"""
    # Use q parameter if search is empty
    if not search and q:
        search = q
    
    # Calculate offset from page
    if page > 1:
        offset = (page - 1) * limit
    else:
        offset = 0
    
    # If no search query and no specific filters, try to get diverse exercises (with offset)
    if not search and not category and not bodyPart and not target:
        return await get_diverse_exercises_local(limit, offset)
    
    params = {"offset": offset, "limit": limit}
    if search: params["search"] = search

    url = f"{BASE_URL}/exercises"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="ExerciseDB error")

        data = r.json()
        
        # Handle new API format: {"success": true, "data": [...], "metadata": {...}}
        if isinstance(data, dict) and "data" in data:
            exercises_data = data["data"]
            metadata = data.get("metadata", {})
        elif isinstance(data, list):
            exercises_data = data
            metadata = {}
        else:
            print(f"Warning: Unexpected data format: {type(data)}")
            return {"items": [], "offset": offset, "limit": limit, "error": "Invalid data format from external API"}
        
        # Validate that exercises_data is a list
        if not isinstance(exercises_data, list):
            print(f"Warning: Expected list but got {type(exercises_data)}: {exercises_data}")
            return {"items": [], "offset": offset, "limit": limit, "error": "Invalid exercises data format"}
        
        # normalize exercises data
        normalized = []
        for item in exercises_data:
            if isinstance(item, dict):
                normalized.append({
                    "id": item.get("exerciseId") or item.get("id") or item.get("_id") or item.get("uuid") or str(hash(str(item))),
                    "name": item.get("name") or "Unknown Exercise",
                    "gifUrl": item.get("gifUrl") or item.get("gif_url") or item.get("gifUrlTemplate") or "",
                    "target": item.get("targetMuscles") or item.get("target") or "",
                    "equipment": item.get("equipments") or item.get("equipment") or "",
                    "bodyPart": item.get("bodyParts") or item.get("bodyPart") or "",
                    "secondaryMuscles": item.get("secondaryMuscles") or [],
                    "instructions": item.get("instructions") or []
                })
            else:
                print(f"Warning: Skipping non-dict item: {item}")
                continue
        
        # Apply additional filters if specified
        if category and category != "all":
            normalized = [ex for ex in normalized if ex.get("bodyPart") == category]
        
        if bodyPart and bodyPart != "all":
            normalized = [ex for ex in normalized if ex.get("bodyPart") == bodyPart]
        
        if target and target != "all":
            normalized = [ex for ex in normalized if ex.get("target") == target]
                
        return {
            "items": normalized, 
            "offset": offset, 
            "limit": limit,
            "metadata": metadata
        }
        
    except Exception as e:
        print(f"Error in exercises endpoint: {e}")
        return {"items": [], "offset": offset, "limit": limit, "error": "Failed to fetch exercises"}

@router.get("/search")
async def search_exercises(
    q: str = Query(..., description="search query"),
    offset: int = Query(0, description="offset for pagination"),
    limit: int = Query(10, description="limit for pagination"),
    threshold: float = Query(0.3, description="search threshold")
):
    """Fuzzy search exercises"""
    params = {"q": q, "offset": offset, "limit": limit, "threshold": threshold}
    
    url = f"{BASE_URL}/exercises/search"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
            
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="ExerciseDB error")

        data = r.json()
            
        # Handle new API format: {"success": true, "data": [...], "metadata": {...}}
        if isinstance(data, dict) and "data" in data:
            exercises_data = data["data"]
            metadata = data.get("metadata", {})
        elif isinstance(data, list):
            exercises_data = data
            metadata = {}
        else:
            print(f"Warning: Unexpected search data format: {type(data)}")
            return {"items": [], "offset": offset, "limit": limit, "error": "Invalid data format from external API"}
        
        return {
            "items": exercises_data, 
            "offset": offset, 
            "limit": limit,
            "metadata": metadata
        }
        
    except Exception as e:
        print(f"Error in search exercises endpoint: {e}")
        return {"items": [], "offset": offset, "limit": limit, "error": "Failed to search exercises"}

@router.get("/filter")
async def filter_exercises(
    search: str = Query("", description="search term"),
    muscles: str = Query("", description="comma-separated muscles"),
    equipment: str = Query("", description="comma-separated equipment"),
    bodyParts: str = Query("", description="comma-separated body parts"),
    offset: int = Query(0, description="offset for pagination"),
    limit: int = Query(10, description="limit for pagination")
):
    """Advanced filter by muscle, equipment, body part"""
    params = {"offset": offset, "limit": limit}
    if search: params["search"] = search
    if muscles: params["muscles"] = muscles
    if equipment: params["equipment"] = equipment
    if bodyParts: params["bodyParts"] = bodyParts
    
    url = f"{BASE_URL}/exercises/filter"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="ExerciseDB error")

        data = r.json()
        return {"items": data, "offset": offset, "limit": limit}
        
    except Exception as e:
        print(f"Error in filter exercises endpoint: {e}")
        return {"items": [], "offset": offset, "limit": limit, "error": "Failed to filter exercises"}

@router.get("/{exercise_id}")
async def get_exercise_by_id(exercise_id: str):
    """Get single exercise by ID"""
    url = f"{BASE_URL}/exercises/{exercise_id}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Exercise not found")

        data = r.json()
        return data
        
    except Exception as e:
        print(f"Error in get exercise by ID endpoint: {e}")
        raise HTTPException(status_code=404, detail="Exercise not found")

@router.get("/bodyparts/{body_part}/exercises")
async def get_exercises_by_body_part(
    body_part: str,
    limit: int = Query(10, description="limit for pagination")
):
    """Get exercises by body part"""
    url = f"{BASE_URL}/bodyparts/{body_part}/exercises"
    params = {"limit": limit}
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch exercises by body part")

        data = r.json()
        return {"items": data, "limit": limit}
        
    except Exception as e:
        print(f"Error in get exercises by body part endpoint: {e}")
        return {"items": [], "limit": limit, "error": "Failed to fetch exercises by body part"}

@router.get("/equipments/{equipment}/exercises")
async def get_exercises_by_equipment(
    equipment: str,
    limit: int = Query(10, description="limit for pagination")
):
    """Get exercises by equipment"""
    url = f"{BASE_URL}/equipments/{equipment}/exercises"
    params = {"limit": limit}
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch exercises by equipment")

        data = r.json()
        return {"items": data, "limit": limit}
        
    except Exception as e:
        print(f"Error in get exercises by equipment endpoint: {e}")
        return {"items": [], "limit": limit, "error": "Failed to fetch exercises by equipment"}

@router.get("/muscles/{muscle}/exercises")
async def get_exercises_by_muscle(
    muscle: str,
    includeSecondary: bool = Query(False, description="include secondary muscles"),
    limit: int = Query(10, description="limit for pagination")
):
    """Get exercises by muscle"""
    url = f"{BASE_URL}/muscles/{muscle}/exercises"
    params = {"includeSecondary": includeSecondary, "limit": limit}
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url, params=params)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch exercises by muscle")

        data = r.json()
        return {"items": data, "limit": limit}
        
    except Exception as e:
        print(f"Error in get exercises by muscle endpoint: {e}")
        return {"items": [], "limit": limit, "error": "Failed to fetch exercises by muscle"}

@router.get("/bodyparts")
async def get_body_parts():
    """Get all body parts"""
    url = f"{BASE_URL}/bodyparts"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch body parts")

        data = r.json()
        return {"items": data}
        
    except Exception as e:
        print(f"Error in get body parts endpoint: {e}")
        return {"items": [], "error": "Failed to fetch body parts"}

@router.get("/muscles")
async def get_muscles():
    """Get all muscles"""
    url = f"{BASE_URL}/muscles"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch muscles")

        data = r.json()
        return {"items": data}
        
    except Exception as e:
        print(f"Error in get muscles endpoint: {e}")
        return {"items": [], "error": "Failed to fetch muscles"}

@router.get("/equipments")
async def get_equipments():
    """Get all equipment"""
    url = f"{BASE_URL}/equipments"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
        
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Failed to fetch equipment")

        data = r.json()
        return {"items": data}
        
    except Exception as e:
        print(f"Error in get equipment endpoint: {e}")
        return {"items": [], "error": "Failed to fetch equipment"}
