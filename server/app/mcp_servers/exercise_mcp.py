import os
import httpx
from fastapi import FastAPI

# Base URL for ExerciseDB API
EXDB_BASE = os.getenv(
    "EXERCISEDB_URL",
    "https://workout-databaese.vercel.app/api/v1"
)

app = FastAPI(title="exercise-db-mcp")

@app.post("/tools/search_exercises")
async def search_exercises(q: str, limit: int = 20):
    """Search exercises by text query from ExerciseDB."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{EXDB_BASE}/exercises/search",
            params={"q": q, "limit": limit}
        )
        r.raise_for_status()
        return r.json()

@app.post("/tools/filter_exercises")
async def filter_exercises(
    muscles: list[str] | None = None,
    body_parts: list[str] | None = None,
    equipment: list[str] | None = None,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
    sortBy: str | None = None,
    sortOrder: str | None = None,
):
    """Filter exercises by body parts, muscles, or equipment."""
    # Use the correct API endpoint for filtering
    async with httpx.AsyncClient() as client:
        # If we have specific body parts, use the bodyparts endpoint
        if body_parts and len(body_parts) == 1:
            # Single body part - use the specific endpoint
            body_part = body_parts[0].lower().replace(" ", "%20")
            # Increase limit to get more exercises for better variety
            params = {"limit": min(limit * 2, 50)}
            if offset > 0:
                params["offset"] = offset
            if search:
                params["search"] = search
            if sortBy:
                params["sortBy"] = sortBy
            if sortOrder:
                params["sortOrder"] = sortOrder
            
            try:
                r = await client.get(
                    f"{EXDB_BASE}/bodyparts/{body_part}/exercises",
                    params=params
                )
                r.raise_for_status()
                return r.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 400:
                    # Fallback to general exercises endpoint
                    pass
                else:
                    raise
        
        # Multiple body parts or other filters - use general exercises endpoint
        params = {"limit": limit, "offset": offset}
        if muscles:
            params["muscles"] = ",".join(muscles)
        if body_parts:
            # Filter out invalid body parts that don't exist in the API
            valid_body_parts = ["neck", "lower arms", "shoulders", "cardio", "upper arms", "chest", "lower legs", "back", "upper legs", "waist"]
            filtered_body_parts = [bp for bp in body_parts if bp in valid_body_parts]
            if filtered_body_parts:
                params["bodyParts"] = ",".join(filtered_body_parts)
        if equipment:
            params["equipment"] = ",".join(equipment)
        if search:
            params["search"] = search
        if sortBy:
            params["sortBy"] = sortBy
        if sortOrder:
            params["sortOrder"] = sortOrder

        try:
            r = await client.get(
                f"{EXDB_BASE}/exercises",
                params=params
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                # Fallback to getting exercises from multiple body parts
                all_exercises = []
                if body_parts:
                    # Filter to only valid body parts and try all of them
                    valid_body_parts = ["neck", "lower arms", "shoulders", "cardio", "upper arms", "chest", "lower legs", "back", "upper legs", "waist"]
                    filtered_body_parts = [bp for bp in body_parts if bp in valid_body_parts]
                    for body_part in filtered_body_parts:
                        try:
                            body_part_clean = body_part.lower().replace(" ", "%20")
                            # Increase limit to get more exercises for better variety
                            r = await client.get(
                                f"{EXDB_BASE}/bodyparts/{body_part_clean}/exercises",
                                params={"limit": min(limit * 2, 50)}  # Get more exercises per body part
                            )
                            if r.status_code == 200:
                                data = r.json()
                                if isinstance(data, dict) and "data" in data:
                                    all_exercises.extend(data["data"])
                        except Exception:
                            continue
                
                # Return in expected format
                return {
                    "success": True,
                    "data": all_exercises[:limit],
                    "metadata": {"totalExercises": len(all_exercises)}
                }
            else:
                raise

@app.get("/tools/list_body_parts")
async def list_body_parts():
    """List all available body parts from ExerciseDB."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{EXDB_BASE}/exercises/bodyparts")
        r.raise_for_status()
        return r.json()