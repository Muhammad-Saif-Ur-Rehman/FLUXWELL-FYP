from fastapi import FastAPI
from app.database.connection import db
from datetime import datetime
from bson import ObjectId

app = FastAPI(title="workout-plan-mcp")

@app.post("/tools/save_plan")
async def save_plan(user_id: str, plan: dict):
    """Save a workout plan for the user"""
    # The user_id is actually the user's ObjectId as a string
    doc = {
        "user_id": ObjectId(user_id),
        "plan": plan,
        "status": "active",
        "created_at": datetime.utcnow(),
    }
    res = db.workout_plans.insert_one(doc)
    return {"plan_id": str(res.inserted_id)}

@app.get("/tools/get_plan")
async def get_plan(user_id: str):
    """Get active plan"""
    # The user_id is actually the user's ObjectId as a string
    plan = db.workout_plans.find_one({"user_id": ObjectId(user_id), "status": "active"})
    if not plan:
        return {}
    plan["_id"] = str(plan["_id"])
    plan["user_id"] = str(plan["user_id"])
    return plan
