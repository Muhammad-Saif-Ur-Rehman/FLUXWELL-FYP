# app/models/workout_profile.py
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

WorkoutLocation = Literal["home", "gym", "outdoor", "mixed"]
Equipment = Literal["bodyweight", "dumbbells", "resistance_bands", "kettlebell", "other"]
Outdoor = Literal["running", "cycling", "outdoor_hiit", "bodyweight_circuits"]
Style = Literal["strength", "cardio", "yoga", "hiit", "mixed"]
Experience = Literal["beginner", "intermediate", "advanced"]

class WorkoutProfileIn(BaseModel):
    location: WorkoutLocation
    equipment: List[Equipment] = Field(default_factory=list)
    outdoor_activities: List[Outdoor] = Field(default_factory=list)
    style_preferences: List[Style] = Field(default_factory=list, min_items=1)
    experience_level: Experience
    daily_minutes: int = Field(ge=10, le=120)
    custom_equipment: Optional[List[str]] = Field(default_factory=list)

class WorkoutProfileOut(WorkoutProfileIn):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

class WorkoutStatus(BaseModel):
    profile_exists: bool
    plan_exists: bool
