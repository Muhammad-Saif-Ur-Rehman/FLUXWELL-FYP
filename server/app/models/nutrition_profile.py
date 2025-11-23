from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class NutritionProfileIn(BaseModel):
    diet_type: Optional[str] = Field(default=None, max_length=64)
    allergies: List[str] = Field(default_factory=list)
    disliked_foods: Optional[str] = Field(default=None, max_length=1024)
    favorite_cuisines: List[str] = Field(default_factory=list)
    meals_per_day: Optional[int] = Field(default=None, ge=1, le=8)
    snacks_per_day: Optional[int] = Field(default=None, ge=0, le=6)
    cooking_time_preference: Optional[str] = Field(default=None, max_length=64)

class NutritionProfileOut(NutritionProfileIn):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

class NutritionProfileStatus(BaseModel):
    profile_exists: bool
