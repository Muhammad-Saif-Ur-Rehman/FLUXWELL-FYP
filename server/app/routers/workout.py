# app/routers/workout.py
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException

from app.database.connection import db
from app.models.workout_profile import (
    WorkoutProfileIn, WorkoutProfileOut, WorkoutStatus
)

router = APIRouter(prefix="/workout", tags=["Workout"])

# ---------- JWT Authentication ----------
from app.auth.jwt_auth import get_current_user_id
# -------------------------------------------------------------

def _oid(val: str) -> ObjectId:
    """Convert string to ObjectId, with proper error handling"""
    if not val:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    try:
        return ObjectId(val)
    except Exception as e:
        # If it's already an ObjectId, return it
        if isinstance(val, ObjectId):
            return val
        # If conversion fails, raise a proper error
        raise HTTPException(status_code=400, detail=f"Invalid user ID format: {val}")

def _convert_objectids_to_strings(data):
    """Convert MongoDB ObjectIds to strings in a document"""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, dict):
                result[key] = _convert_objectids_to_strings(value)
            elif isinstance(value, list):
                result[key] = [_convert_objectids_to_strings(item) for item in value]
            elif hasattr(value, '__dict__'):
                # Handle objects with __dict__ attribute (like Pydantic models)
                result[key] = _convert_objectids_to_strings(value.__dict__)
            else:
                result[key] = value
        return result
    elif isinstance(data, list):
        return [_convert_objectids_to_strings(item) for item in data]
    elif hasattr(data, '__dict__'):
        # Handle objects with __dict__ attribute (like Pydantic models)
        return _convert_objectids_to_strings(data.__dict__)
    else:
        return data

def _ensure_indexes():
    # one workout profile per user
    try:
        db.workout_profiles.create_index([("user_id", 1)], unique=True, name="ux_user_profile")
    except Exception:
        pass
    # optional: you will use these later
    try:
        db.exercise_library.create_index([("slug", 1)], unique=True, name="ux_exercise_slug")
        db.workout_plans.create_index([("user_id", 1), ("status", 1)], name="idx_user_status")
    except Exception:
        pass

@router.on_event("startup")
def _startup():
    _ensure_indexes()

@router.get("/status", response_model=WorkoutStatus)
def status(user_id: str = Depends(get_current_user_id)):
    profile = db.workout_profiles.find_one({"user_id": _oid(user_id)})
    plan = db.workout_plans.find_one({"user_id": _oid(user_id), "status": "active"})
    return WorkoutStatus(profile_exists=bool(profile), plan_exists=bool(plan))

@router.get("/profile", response_model=Optional[WorkoutProfileOut])
def read_profile(user_id: str = Depends(get_current_user_id)):
    doc = db.workout_profiles.find_one({"user_id": _oid(user_id)})
    if not doc:
        return None
    return WorkoutProfileOut(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        location=doc["location"],
        equipment=doc.get("equipment", []),
        outdoor_activities=doc.get("outdoor_activities", []),
        style_preferences=doc.get("style_preferences", []),
        experience_level=doc["experience_level"],
        daily_minutes=doc["daily_minutes"],
        custom_equipment=doc.get("custom_equipment", []),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )

@router.post("/profile", response_model=WorkoutProfileOut)
def upsert_profile(payload: WorkoutProfileIn, user_id: str = Depends(get_current_user_id)):
    now = datetime.utcnow()
    existing = db.workout_profiles.find_one({"user_id": _oid(user_id)})
    body = {
        "user_id": _oid(user_id),
        "location": payload.location,
        "equipment": payload.equipment,
        "outdoor_activities": payload.outdoor_activities,
        "style_preferences": payload.style_preferences,
        "experience_level": payload.experience_level,
        "daily_minutes": payload.daily_minutes,
        "custom_equipment": payload.custom_equipment,
        "updated_at": now,
    }
    if existing:
        db.workout_profiles.update_one({"_id": existing["_id"]}, {"$set": body})
        saved = db.workout_profiles.find_one({"_id": existing["_id"]})
    else:
        body["created_at"] = now
        res = db.workout_profiles.insert_one(body)
        saved = db.workout_profiles.find_one({"_id": res.inserted_id})

    return WorkoutProfileOut(
        id=str(saved["_id"]),
        user_id=str(saved["user_id"]),
        location=saved["location"],
        equipment=saved.get("equipment", []),
        outdoor_activities=saved.get("outdoor_activities", []),
        style_preferences=saved.get("style_preferences", []),
        experience_level=saved["experience_level"],
        daily_minutes=saved["daily_minutes"],
        custom_equipment=saved.get("custom_equipment", []),
        created_at=saved["created_at"],
        updated_at=saved["updated_at"],
    )
