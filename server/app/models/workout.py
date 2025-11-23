from pydantic import BaseModel, Field, validator
from typing import List, Optional, Union
from datetime import datetime
from bson import ObjectId

class ExerciseRef(BaseModel):
    exercise_id: str
    name: str
    gifUrl: Optional[str] = None
    target: Optional[str] = None
    equipment: Optional[str] = None
    bodyPart: Optional[str] = None
    sets: int = 3
    reps: int = 10

class WorkoutDay(BaseModel):
    weekday: int  # 0-6 (Mon-Sun)
    name: str
    exercises: List[ExerciseRef] = []

class WorkoutPlan(BaseModel):
    user_id: str
    days: List[WorkoutDay] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @validator('user_id', pre=True)
    def convert_objectid_to_string(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

class WorkoutSession(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    exercises: List[ExerciseRef] = []
    completed_exercise_ids: List[str] = []
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None

    @validator('user_id', pre=True)
    def convert_objectid_to_string(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v
