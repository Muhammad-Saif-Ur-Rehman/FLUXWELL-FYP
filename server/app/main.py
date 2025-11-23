from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.routers import auth, assessment_ai, goal_feasibility_ai
from app.routers import workout
from app.routers import exercises, workouts
import os
from dotenv import load_dotenv
from bson import ObjectId
import json
from datetime import datetime
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from app.routers import ai_workout
from app.routers import progress_enhanced  # path: app/routers/progress_enhanced.py
from app.routers import realtime  # path: app/routers/realtime.py
from app.routers import ai_realtime  # path: app/routers/ai_realtime.py
from app.routers.fluxie_chat_langgraph import router as fluxie_router
from app.routers.nutrition import router as nutrition_router
from app.routers import blog
from app.routers import ai_movement_analysis

load_dotenv()

# Custom JSON encoder for MongoDB ObjectId and datetime
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

# Override FastAPI's default JSON encoder
class MongoJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            cls=MongoJSONEncoder
        ).encode("utf-8")

app = FastAPI(title="FluxWell API", version="1.0.0")

# Override the default JSON response class
app.json_response_class = MongoJSONResponse

# Add GZip compression middleware for better performance
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Session middleware (REQUIRED for OAuth)
app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv("SECRET_KEY", os.getenv("GROQ_API_KEY"))
)

# CORS middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(assessment_ai.router)
app.include_router(goal_feasibility_ai.router)
app.include_router(workout.router)
app.include_router(exercises.router)
app.include_router(workouts.router)
app.include_router(ai_workout.router)
app.include_router(realtime.router)
app.include_router(ai_realtime.router)
app.include_router(progress_enhanced.router)
app.include_router(fluxie_router)
app.include_router(nutrition_router)
app.include_router(blog.router)
app.include_router(ai_movement_analysis.router)

@app.on_event("startup")
async def _app_startup():
    # Ensure workout-related indexes exist (idempotent)
    try:
        from app.routers.workout import _ensure_indexes
        _ensure_indexes()
    except Exception as e:
        print(f"Warning: Could not ensure workout indexes: {e}")
        pass
    
    # Start AI Movement Analysis module
    try:
        from app.routers.ai_movement_analysis import startup_ai_movement_analysis
        await startup_ai_movement_analysis()
    except Exception as e:
        print(f"Warning: Could not start AI Movement Analysis: {e}")
        pass

@app.on_event("shutdown")
async def _app_shutdown():
    # Shutdown AI Movement Analysis module
    try:
        from app.routers.ai_movement_analysis import shutdown_ai_movement_analysis
        await shutdown_ai_movement_analysis()
    except Exception as e:
        print(f"Warning: Could not shutdown AI Movement Analysis: {e}")
        pass

@app.get("/")
def home():
    return {"message": "FluxWell API Running"}

@app.get("/health")
def health_check():
    """Simple health check endpoint for performance testing"""
    return {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}
