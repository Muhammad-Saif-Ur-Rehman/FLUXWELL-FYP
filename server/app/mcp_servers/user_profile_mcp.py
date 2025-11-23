from fastapi import FastAPI
from app.database.connection import db
from bson import ObjectId

app = FastAPI(title="user-profile-mcp")

@app.get("/tools/get_user_profile")
async def get_user_profile(user_id: str):
    """Fetch user onboarding details"""
    # The user_id is actually the user's ObjectId as a string
    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return {}
    user["_id"] = str(user["_id"])
    return user

@app.get("/tools/get_workout_profile")
async def get_workout_profile(user_id: str):
    """Fetch workout profile"""
    # The user_id is actually the user's ObjectId as a string
    prof = db.workout_profiles.find_one({"user_id": ObjectId(user_id)})
    if not prof:
        return {}
    prof["_id"] = str(prof["_id"]) if prof.get("_id") else None
    prof["user_id"] = str(prof["user_id"]) if prof.get("user_id") else None
    return prof
