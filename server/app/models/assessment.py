from pydantic import BaseModel
from typing import Literal

class AssessmentRequest(BaseModel):
    age: int
    gender: Literal["male", "female"]
    weight: float  # in kg
    height: float  # in cm
    activity_level: Literal["low", "medium", "high"]

class AssessmentResponse(BaseModel):
    bmi: float
    calories: float
    goal_feasible: bool
