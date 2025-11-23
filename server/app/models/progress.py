import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Literal, Any
from bson import ObjectId


# -----------------
# Progress Entries
# -----------------
class ProgressEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    weight: Optional[float] = None
    waist: Optional[float] = None
    chest: Optional[float] = None
    hips: Optional[float] = None
    arms: Optional[float] = None
    legs: Optional[float] = None
    notes: Optional[str] = None


class ProgressEntryOut(ProgressEntryIn):
    id: str
    user_id: str


# -----------------
# Milestones
# -----------------
class MilestoneIn(BaseModel):
    title: str
    target_metric: str  # e.g. "weight"
    target_value: float  # e.g. -5 for "lose 5kg"
    deadline: Optional[datetime.date] = None


class MilestoneOut(MilestoneIn):
    id: str
    user_id: str
    progress: float  # % toward goal
    completed: bool
    start_value: Optional[float] = None
    created_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None


# -----------------
# New Progress Schemas (for flexible logging)
# -----------------
class ProgressIn(BaseModel):
    weight: Optional[float] = None
    waist: Optional[float] = None
    chest: Optional[float] = None
    hips: Optional[float] = None
    arms: Optional[float] = None
    legs: Optional[float] = None
    notes: Optional[str] = None


class ProgressOut(ProgressIn):
    id: str
    created_at: datetime.datetime


# -----------------
# Streaks
# -----------------
class StreakOut(BaseModel):
    current_streak: int
    longest_streak: int
    last_entry_date: Optional[datetime.date] = None


# -----------------
# Badges
# -----------------
class BadgeOut(BaseModel):
    badge_id: str
    name: str
    description: str
    unlocked: bool
    unlocked_date: Optional[datetime.datetime] = None


# -----------------
# Nutrition Models
# -----------------
class CalorieEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    consumed: float
    recommended: float
    notes: Optional[str] = None


class CalorieEntryOut(CalorieEntryIn):
    id: str
    user_id: str
    created_at: datetime.datetime


class MacroEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    protein: float
    carbs: float
    fats: float
    protein_target: float
    carbs_target: float
    fats_target: float


class MacroEntryOut(MacroEntryIn):
    id: str
    user_id: str
    created_at: datetime.datetime


class MealEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    meal_name: str
    planned: bool
    followed: bool
    time: str
    notes: Optional[str] = None


class MealEntryOut(MealEntryIn):
    id: str
    user_id: str
    created_at: datetime.datetime


# -----------------
# Health Models
# -----------------
class SleepEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    duration: float  # hours
    quality: Literal["poor", "fair", "good", "excellent"]
    deep_sleep: float  # hours
    rem_sleep: float  # hours
    light_sleep: float  # hours
    awakenings: int
    recovery_score: Optional[float] = None


class SleepEntryOut(SleepEntryIn):
    id: str
    user_id: str
    created_at: datetime.datetime


class HydrationEntryIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    consumed: float  # ml
    target: float  # ml
    bottles: int
    reminders: int


class HydrationEntryOut(HydrationEntryIn):
    id: str
    user_id: str
    created_at: datetime.datetime


# -----------------
# Goal Models
# -----------------
class GoalIn(BaseModel):
    title: str
    description: Optional[str] = None
    target: float
    current: float = 0.0
    deadline: Optional[datetime.date] = None
    category: Literal["fitness", "nutrition", "health", "lifestyle"]
    unit: Optional[str] = None


class GoalOut(GoalIn):
    id: str
    user_id: str
    completed: bool = False
    achievement_rate: float = 0.0
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None


# -----------------
# Workout Completion Models
# -----------------
class WorkoutCompletionIn(BaseModel):
    date: datetime.date = Field(default_factory=datetime.date.today)
    workout_id: str
    exercises_planned: int
    exercises_completed: int
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class WorkoutCompletionOut(WorkoutCompletionIn):
    id: str
    user_id: str
    completion_rate: float
    created_at: datetime.datetime


# -----------------
# Enhanced Badge Models
# -----------------
class BadgeIn(BaseModel):
    name: str
    description: str
    icon: str
    rarity: Literal["common", "rare", "epic", "legendary"] = "common"
    category: Literal["workout", "nutrition", "health", "general"] = "general"
    requirements: Dict[str, Any]


class EnhancedBadgeOut(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    rarity: str
    category: str
    unlocked: bool
    unlocked_date: Optional[datetime.datetime] = None
    progress: Optional[float] = None  # For progress tracking


# -----------------
# Dashboard Models
# -----------------
class DashboardMetrics(BaseModel):
    workout_completion: Dict[str, Any]
    calorie_intake: Dict[str, Any]
    macro_breakdown: Dict[str, Any]
    meal_compliance: Dict[str, Any]
    activity_trends: Dict[str, Any]
    goal_achievement: Dict[str, Any]
    sleep_recovery: Dict[str, Any]
    hydration_trends: Dict[str, Any]
    badges_streaks: Dict[str, Any]


class WeeklyData(BaseModel):
    date: datetime.date
    value: float
    target: Optional[float] = None
