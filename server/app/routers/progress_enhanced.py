from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta
from bson import ObjectId
import math

from app.models.progress import (
    # Existing models
    ProgressEntryIn, ProgressEntryOut, MilestoneIn, MilestoneOut,
    StreakOut, BadgeOut, ProgressIn, ProgressOut,
    # New models
    CalorieEntryIn, CalorieEntryOut, MacroEntryIn, MacroEntryOut,
    MealEntryIn, MealEntryOut, SleepEntryIn, SleepEntryOut,
    HydrationEntryIn, HydrationEntryOut, GoalIn, GoalOut,
    WorkoutCompletionIn, WorkoutCompletionOut, EnhancedBadgeOut,
    DashboardMetrics, WeeklyData
)
from app.database.connection import db
from app.auth.jwt_auth import get_current_user_id

router = APIRouter(prefix="/api/progress", tags=["Progress Enhanced"])


# ---------- Utils ----------
def _oid(val: str):
    try:
        return ObjectId(val)
    except:
        return val


# -------------------------
# Enhanced Badge System
# -------------------------
ENHANCED_BADGE_RULES = {
    # Starter badges (easy to unlock for engagement)
    "First Steps": {
        "requirements": {"meals_logged": 1},
        "rarity": "common",
        "category": "nutrition",
        "icon": "🌟",
        "description": "Log your first meal"
    },
    "Hydration Starter": {
        "requirements": {"water_logged": 1},
        "rarity": "common",
        "category": "health",
        "icon": "💧",
        "description": "Log your first water intake"
    },
    "Week Warrior": {
        "requirements": {"login_streak": 7},
        "rarity": "common",
        "category": "general",
        "icon": "🔥",
        "description": "7-day login streak"
    },
    
    # Workout badges
    "Workout Beginner": {
        "requirements": {"workouts_completed": 1},
        "rarity": "common",
        "category": "workout",
        "icon": "💪",
        "description": "Complete your first workout"
    },
    "Workout Warrior": {
        "requirements": {"workouts_completed": 10},
        "rarity": "rare",
        "category": "workout",
        "icon": "🏋️",
        "description": "Complete 10 workouts"
    },
    "Gym Legend": {
        "requirements": {"workouts_completed": 50},
        "rarity": "epic",
        "category": "workout",
        "icon": "🏆",
        "description": "Complete 50 workouts"
    },
    "Perfect Week": {
        "requirements": {"workout_streak": 7},
        "rarity": "rare",
        "category": "workout",
        "icon": "⭐",
        "description": "7-day workout streak"
    },
    
    # Nutrition badges
    "Meal Planner": {
        "requirements": {"meals_logged": 10},
        "rarity": "common",
        "category": "nutrition",
        "icon": "🍽️",
        "description": "Log 10 meals"
    },
    "Nutrition Enthusiast": {
        "requirements": {"meals_logged": 50},
        "rarity": "rare",
        "category": "nutrition",
        "icon": "🥗",
        "description": "Log 50 meals"
    },
    "Nutrition Master": {
        "requirements": {"meals_logged": 100},
        "rarity": "epic",
        "category": "nutrition",
        "icon": "👨‍🍳",
        "description": "Log 100 meals"
    },
    "Macro Master": {
        "requirements": {"macro_tracking_days": 14},
        "rarity": "rare",
        "category": "nutrition",
        "icon": "📊",
        "description": "Track macros for 14 days"
    },
    
    # Health badges
    "Sleep Champion": {
        "requirements": {"good_sleep_days": 7},
        "rarity": "rare",
        "category": "health",
        "icon": "😴",
        "description": "7 days of good sleep"
    },
    "Hydration Hero": {
        "requirements": {"water_goal_days": 7},
        "rarity": "common",
        "category": "health",
        "icon": "💦",
        "description": "Meet water goals for 7 days"
    },
    "Hydration Champion": {
        "requirements": {"water_goal_days": 30},
        "rarity": "epic",
        "category": "health",
        "icon": "🌊",
        "description": "Meet water goals for 30 days"
    },
    
    # General badges
    "Goal Setter": {
        "requirements": {"goals_created": 1},
        "rarity": "common",
        "category": "general",
        "icon": "🎯",
        "description": "Set your first goal"
    },
    "Goal Crusher": {
        "requirements": {"goals_completed": 3},
        "rarity": "rare",
        "category": "general",
        "icon": "🎖️",
        "description": "Complete 3 goals"
    },
    "Consistency King": {
        "requirements": {"login_streak": 30},
        "rarity": "epic",
        "category": "general",
        "icon": "👑",
        "description": "30-day login streak"
    },
    "Dedication Legend": {
        "requirements": {"login_streak": 100},
        "rarity": "legendary",
        "category": "general",
        "icon": "🌟",
        "description": "100-day login streak"
    }
}


def _check_enhanced_badges(user_id: str) -> List[Dict[str, Any]]:
    """Check and unlock enhanced badges based on user activity"""
    newly_unlocked = []
    
    # Get user stats
    stats = _get_user_stats(user_id)
    
    for badge_name, badge_info in ENHANCED_BADGE_RULES.items():
        # Check if already unlocked
        existing = db.badges.find_one({"user_id": _oid(user_id), "name": badge_name})
        if existing and existing.get("unlocked"):
            continue
            
        # Check requirements
        requirements = badge_info["requirements"]
        unlocked_badge = False
        
        try:
            # Check each requirement type
            for req_key, req_value in requirements.items():
                if req_key == "meals_logged":
                    unlocked_badge = stats.get("total_meals", 0) >= req_value
                elif req_key == "water_logged":
                    unlocked_badge = stats.get("total_water_logs", 0) >= req_value
                elif req_key == "login_streak":
                    unlocked_badge = stats.get("current_streak", 0) >= req_value
                elif req_key == "workouts_completed":
                    unlocked_badge = stats.get("total_workouts", 0) >= req_value
                elif req_key == "workout_streak":
                    unlocked_badge = stats.get("workout_streak", 0) >= req_value
                elif req_key == "macro_tracking_days":
                    unlocked_badge = stats.get("macro_days", 0) >= req_value
                elif req_key == "good_sleep_days":
                    unlocked_badge = stats.get("good_sleep_days", 0) >= req_value
                elif req_key == "water_goal_days":
                    unlocked_badge = stats.get("water_goal_days", 0) >= req_value
                elif req_key == "goals_created":
                    unlocked_badge = stats.get("total_goals", 0) >= req_value
                elif req_key == "goals_completed":
                    unlocked_badge = stats.get("completed_goals", 0) >= req_value
                    
        except Exception as e:
            unlocked_badge = False
            
        if unlocked_badge:
            # Create or update badge entry
            badge_doc = {
                "user_id": _oid(user_id),
                "name": badge_name,
                "description": badge_info["description"],
                "icon": badge_info["icon"],
                "rarity": badge_info["rarity"],
                "category": badge_info["category"],
                "unlocked": True,
                "unlocked_date": datetime.utcnow(),
                "created_at": datetime.utcnow()
            }
            
            if existing:
                # Update existing locked badge to unlocked
                db.badges.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"unlocked": True, "unlocked_date": datetime.utcnow()}}
                )
            else:
                # Insert new badge
                db.badges.insert_one(badge_doc)
            
            newly_unlocked.append({
                "name": badge_name,
                "description": badge_info["description"],
                "icon": badge_info["icon"],
                "rarity": badge_info["rarity"],
                "category": badge_info["category"]
            })
    
    return newly_unlocked


def _get_user_stats(user_id: str) -> Dict[str, Any]:
    """Get comprehensive user statistics for badge checking"""
    stats = {}
    
    # Get streak data from nutrition module
    streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
    stats["current_streak"] = streak_doc.get("current_streak", 0) if streak_doc else 0
    stats["longest_streak"] = streak_doc.get("longest_streak", 0) if streak_doc else 0
    
    # Count total meals logged
    total_meals = db.meals.count_documents({"user_id": _oid(user_id)})
    stats["total_meals"] = total_meals
    
    # Count total water logs
    total_water = db.water_logs.count_documents({"user_id": _oid(user_id)})
    stats["total_water_logs"] = total_water
    
    # Count workouts completed (from workout sessions or completions)
    total_workouts = db.workout_completions.count_documents({"user_id": _oid(user_id)}) if db.workout_completions.count_documents({}) > 0 else 0
    stats["total_workouts"] = total_workouts
    
    # Calculate workout streak (simplified - based on consecutive workout days)
    workout_streak = 0
    # TODO: Implement proper workout streak calculation
    stats["workout_streak"] = workout_streak
    
    # Count days with macro tracking (days with meals logged)
    now = datetime.utcnow()
    unique_meal_dates = db.meals.distinct("timestamp", {"user_id": _oid(user_id)})
    macro_days = len(set([d.date().isoformat() for d in unique_meal_dates if isinstance(d, datetime)]))
    stats["macro_days"] = macro_days
    
    # Count good sleep days (sleep entries with quality >= 7 or "good")
    good_sleep = db.sleep_entries.count_documents({
        "user_id": _oid(user_id),
        "$or": [
            {"quality": {"$gte": 7}},
            {"quality": "good"},
            {"quality": "excellent"}
        ]
    }) if db.sleep_entries.count_documents({}) > 0 else 0
    stats["good_sleep_days"] = good_sleep
    
    # Count days meeting water goals
    # Get water goal from nutrition profile
    profile = db.nutrition_profiles.find_one({"user_id": _oid(user_id)})
    macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
    calories = macro_targets.get("calories", 2000) if macro_targets else 2000
    water_goal_ml = int((calories / 1000) * 1000) + 500  # Simplified water goal calculation
    
    # Count days where total water >= goal
    water_goal_days = 0
    unique_water_dates = db.water_logs.distinct("timestamp", {"user_id": _oid(user_id)})
    for date_str in set([d.date().isoformat() for d in unique_water_dates if isinstance(d, datetime)]):
        day_start = datetime.fromisoformat(date_str)
        day_end = day_start + timedelta(days=1)
        daily_water = sum([
            log.get("amount_ml", 0) 
            for log in db.water_logs.find({
                "user_id": _oid(user_id),
                "timestamp": {"$gte": day_start, "$lt": day_end}
            })
        ])
        if daily_water >= water_goal_ml:
            water_goal_days += 1
    stats["water_goal_days"] = water_goal_days
    
    # Count goals created and completed
    total_goals = db.goals.count_documents({"user_id": _oid(user_id)}) if db.goals.count_documents({}) > 0 else 0
    completed_goals = db.goals.count_documents({"user_id": _oid(user_id), "completed": True}) if db.goals.count_documents({}) > 0 else 0
    stats["total_goals"] = total_goals
    stats["completed_goals"] = completed_goals
    
    return stats


# -------------------------
# Nutrition Endpoints
# -------------------------
@router.post("/nutrition/calories", response_model=CalorieEntryOut)
def log_calories(entry: CalorieEntryIn, user_id: str = Depends(get_current_user_id)):
    """Log daily calorie intake"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    
    result = db.calorie_entries.insert_one(doc)
    saved = db.calorie_entries.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return CalorieEntryOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "consumed", "recommended", "notes", "created_at"]}
    )


@router.get("/nutrition/calories", response_model=List[CalorieEntryOut])
def get_calories(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get calorie entries for the last N days - pulls from nutrition module meals"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    start_datetime = datetime.combine(start_date, datetime.min.time())
    
    # Get macro targets for recommended calories
    macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
    recommended_calories = macro_targets.get("calories", 2000) if macro_targets else 2000
    
    # Aggregate daily calories from meals in nutrition module
    daily_calories = {}
    meals = db.meals.find({
        "user_id": _oid(user_id),
        "timestamp": {"$gte": start_datetime}
    })
    
    for meal in meals:
        meal_date = meal.get("timestamp").date().isoformat()
        total_cals = sum(item.get("calories", 0) for item in meal.get("items", []))
        daily_calories[meal_date] = daily_calories.get(meal_date, 0) + total_cals
    
    # Convert to CalorieEntryOut format
    results = []
    for date_str, consumed in sorted(daily_calories.items(), reverse=True):
        results.append(CalorieEntryOut(
            id=f"{user_id}_{date_str}",  # Generate synthetic ID
            user_id=user_id,
            date=date_str,
            consumed=round(consumed),
            recommended=recommended_calories,
            notes="",
            created_at=datetime.fromisoformat(date_str)
        ))
    
    return results


@router.post("/nutrition/macros", response_model=MacroEntryOut)
def log_macros(entry: MacroEntryIn, user_id: str = Depends(get_current_user_id)):
    """Log daily macronutrient intake"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    
    result = db.macro_entries.insert_one(doc)
    saved = db.macro_entries.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return MacroEntryOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "protein", "carbs", "fats", "protein_target", "carbs_target", "fats_target", "created_at"]}
    )


@router.get("/nutrition/macros", response_model=List[MacroEntryOut])
def get_macros(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get macro entries for the last N days - pulls from nutrition module meals"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    start_datetime = datetime.combine(start_date, datetime.min.time())
    
    # Get macro targets
    macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
    protein_target = macro_targets.get("protein_g", 150) if macro_targets else 150
    carbs_target = macro_targets.get("carbs_g", 250) if macro_targets else 250
    fats_target = macro_targets.get("fats_g", 67) if macro_targets else 67
    
    # Aggregate daily macros from meals in nutrition module
    daily_macros = {}
    meals = db.meals.find({
        "user_id": _oid(user_id),
        "timestamp": {"$gte": start_datetime}
    })
    
    for meal in meals:
        meal_date = meal.get("timestamp").date().isoformat()
        if meal_date not in daily_macros:
            daily_macros[meal_date] = {"protein": 0, "carbs": 0, "fats": 0}
        
        for item in meal.get("items", []):
            daily_macros[meal_date]["protein"] += item.get("protein_g", 0)
            daily_macros[meal_date]["carbs"] += item.get("carbs_g", 0)
            daily_macros[meal_date]["fats"] += item.get("fats_g", 0)
    
    # Convert to MacroEntryOut format
    results = []
    for date_str, macros in sorted(daily_macros.items(), reverse=True):
        results.append(MacroEntryOut(
            id=f"{user_id}_{date_str}",  # Generate synthetic ID
            user_id=user_id,
            date=date_str,
            protein=round(macros["protein"]),
            carbs=round(macros["carbs"]),
            fats=round(macros["fats"]),
            protein_target=protein_target,
            carbs_target=carbs_target,
            fats_target=fats_target,
            created_at=datetime.fromisoformat(date_str)
        ))
    
    return results


@router.post("/nutrition/meals", response_model=MealEntryOut)
def log_meal(entry: MealEntryIn, user_id: str = Depends(get_current_user_id)):
    """Log meal compliance"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    
    result = db.meal_entries.insert_one(doc)
    saved = db.meal_entries.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return MealEntryOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "meal_name", "planned", "followed", "time", "notes", "created_at"]}
    )


@router.get("/nutrition/meals", response_model=List[MealEntryOut])
def get_meals(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get meal entries for the last N days - pulls from nutrition module meals"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    start_datetime = datetime.combine(start_date, datetime.min.time())
    
    # Get meals from nutrition module
    meals = db.meals.find({
        "user_id": _oid(user_id),
        "timestamp": {"$gte": start_datetime}
    }).sort("timestamp", -1)
    
    # Convert to MealEntryOut format
    results = []
    for meal in meals:
        meal_date = meal.get("timestamp").date().isoformat()
        meal_time = meal.get("timestamp").strftime("%H:%M")
        meal_type = meal.get("meal_type", "meal")
        
        # Determine if meal was planned/followed based on notes
        notes = meal.get("notes", "")
        planned = "planned" in notes.lower() or "agent" in notes.lower()
        followed = planned  # If it was logged from a planned meal, it was followed
        
        results.append(MealEntryOut(
            id=str(meal["_id"]),
            user_id=user_id,
            date=meal_date,
            meal_name=meal_type.capitalize(),
            planned=planned,
            followed=followed,
            time=meal_time,
            notes=notes,
            created_at=meal.get("created_at", meal.get("timestamp"))
        ))
    
    return results


# -------------------------
# Health Endpoints
# -------------------------
@router.post("/health/sleep", response_model=SleepEntryOut)
def log_sleep(entry: SleepEntryIn, user_id: str = Depends(get_current_user_id)):
    """Log sleep data"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    
    # Calculate recovery score if not provided
    if doc.get("recovery_score") is None:
        doc["recovery_score"] = _calculate_recovery_score(doc)
    
    result = db.sleep_entries.insert_one(doc)
    saved = db.sleep_entries.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return SleepEntryOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "duration", "quality", "deep_sleep", "rem_sleep", "light_sleep", "awakenings", "recovery_score", "created_at"]}
    )


@router.get("/health/sleep", response_model=List[SleepEntryOut])
def get_sleep(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get sleep entries for the last N days"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    
    docs = db.sleep_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": start_date.isoformat()}
    }).sort("date", -1)
    
    return [
        SleepEntryOut(
            id=str(d["_id"]),
            user_id=user_id,
            **{k: d.get(k) for k in ["date", "duration", "quality", "deep_sleep", "rem_sleep", "light_sleep", "awakenings", "recovery_score", "created_at"]}
        )
        for d in docs
    ]


@router.post("/health/hydration", response_model=HydrationEntryOut)
def log_hydration(entry: HydrationEntryIn, user_id: str = Depends(get_current_user_id)):
    """Log hydration data"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    
    result = db.hydration_entries.insert_one(doc)
    saved = db.hydration_entries.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return HydrationEntryOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "consumed", "target", "bottles", "reminders", "created_at"]}
    )


@router.get("/health/hydration", response_model=List[HydrationEntryOut])
def get_hydration(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get hydration entries for the last N days - pulls from nutrition module water tracking"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    start_datetime = datetime.combine(start_date, datetime.min.time())
    
    # Get nutrition profile and macro targets for water goal
    profile = db.nutrition_profiles.find_one({"user_id": _oid(user_id)})
    macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
    
    # Calculate water goal (simplified version of _compute_water_goal from nutrition.py)
    calories = macro_targets.get("calories", 2000) if macro_targets else 2000
    activity_multiplier = 1.0  # Default
    water_goal_ml = int((calories / 1000) * 1000) + 500  # Simplified formula
    
    # Aggregate daily water from water_logs in nutrition module
    daily_water = {}
    water_logs = db.water_logs.find({
        "user_id": _oid(user_id),
        "timestamp": {"$gte": start_datetime}
    })
    
    for log in water_logs:
        log_date = log.get("timestamp").date().isoformat()
        daily_water[log_date] = daily_water.get(log_date, 0) + log.get("amount_ml", 0)
    
    # Convert to HydrationEntryOut format
    results = []
    for date_str, consumed in sorted(daily_water.items(), reverse=True):
        results.append(HydrationEntryOut(
            id=f"{user_id}_{date_str}",  # Generate synthetic ID
            user_id=user_id,
            date=date_str,
            consumed=round(consumed),
            target=water_goal_ml,
            bottles=round(consumed / 500),  # Assuming 500ml bottle
            reminders=0,
            created_at=datetime.fromisoformat(date_str)
        ))
    
    return results


# -------------------------
# Goal Management Endpoints
# -------------------------
@router.post("/goals", response_model=GoalOut)
def create_goal(goal: GoalIn, user_id: str = Depends(get_current_user_id)):
    """Create a new goal"""
    doc = goal.dict()
    doc["user_id"] = _oid(user_id)
    doc["created_at"] = datetime.utcnow()
    doc["achievement_rate"] = 0.0
    
    result = db.goals.insert_one(doc)
    saved = db.goals.find_one({"_id": result.inserted_id})
    
    return GoalOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["title", "description", "target", "current", "deadline", "category", "unit", "completed", "achievement_rate", "created_at", "completed_at"]}
    )


@router.get("/goals", response_model=Dict[str, Any])
def get_goals(
    user_id: str = Depends(get_current_user_id),
    category: Optional[str] = Query(None, description="Filter by category"),
    completed: Optional[bool] = Query(None, description="Filter by completion status")
):
    """Get user goals with optional filtering and aggregate statistics - focuses on nutrition, health, and lifestyle"""
    query = {"user_id": _oid(user_id)}
    if category:
        query["category"] = category
    if completed is not None:
        query["completed"] = completed
    
    # Get all goals
    all_goals = list(db.goals.find({"user_id": _oid(user_id)}).sort("created_at", -1))
    
    # If no goals exist, create default nutrition/health/lifestyle goals
    if len(all_goals) == 0:
        _create_default_goals(user_id)
        all_goals = list(db.goals.find({"user_id": _oid(user_id)}).sort("created_at", -1))
    
    # Filter to exclude workout/fitness goals if no category specified
    if not category:
        # Focus on nutrition, health, and lifestyle goals
        filtered_goals = [g for g in all_goals if g.get("category", "").lower() not in ["workout", "fitness"]]
    else:
        filtered_goals = [g for g in all_goals if (not category or g.get("category") == category) and (completed is None or g.get("completed", False) == completed)]
    
    # Convert to GoalOut format and auto-update progress
    goals_list = []
    for d in filtered_goals:
        # Auto-update current progress based on actual data
        current = _calculate_goal_progress(user_id, d)
        target = d.get("target", 0)
        achievement_rate = min(100.0, (current / target * 100)) if target > 0 else 0.0
        is_completed = achievement_rate >= 100.0
        
        # Update in database if changed
        update_fields = {}
        if d.get("current") != current:
            update_fields["current"] = current
        if d.get("achievement_rate") != achievement_rate:
            update_fields["achievement_rate"] = achievement_rate
        if d.get("completed") != is_completed and is_completed:
            update_fields["completed"] = is_completed
            update_fields["completed_at"] = datetime.utcnow()
        
        if update_fields:
            db.goals.update_one(
                {"_id": d["_id"]},
                {"$set": update_fields}
            )
        
        goals_list.append({
            "id": str(d["_id"]),
            "user_id": user_id,
            "title": d.get("title", ""),
            "description": d.get("description", ""),
            "target": d.get("target", 0),
            "current": d.get("current", 0),
            "deadline": d.get("deadline", ""),
            "category": d.get("category", "general"),
            "unit": d.get("unit", ""),
            "completed": d.get("completed", False),
            "achievement_rate": achievement_rate,
            "created_at": d.get("created_at"),
            "completed_at": d.get("completed_at")
        })
    
    # Calculate aggregate statistics
    total_goals = len(goals_list)
    completed_goals = len([g for g in goals_list if g["completed"]])
    achievement_rate = round((completed_goals / total_goals * 100)) if total_goals > 0 else 0
    
    return {
        "goals": goals_list,
        "total_goals": total_goals,
        "completed_goals": completed_goals,
        "achievement_rate": achievement_rate,
        "active_goals": total_goals - completed_goals
    }


@router.put("/goals/{goal_id}/progress")
def update_goal_progress(
    goal_id: str,
    progress: float,
    user_id: str = Depends(get_current_user_id)
):
    """Update goal progress"""
    goal = db.goals.find_one({"_id": _oid(goal_id), "user_id": _oid(user_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Update progress
    achievement_rate = min(100.0, (progress / goal["target"]) * 100) if goal["target"] > 0 else 0.0
    completed = achievement_rate >= 100.0
    
    update_data = {
        "current": progress,
        "achievement_rate": achievement_rate,
        "completed": completed
    }
    
    if completed and not goal.get("completed", False):
        update_data["completed_at"] = datetime.utcnow()
        # Check for badges (user just completed a goal)
        _check_enhanced_badges(user_id)
    
    db.goals.update_one(
        {"_id": _oid(goal_id)},
        {"$set": update_data}
    )
    
    return {"message": "Goal progress updated", "achievement_rate": achievement_rate, "completed": completed}


# -------------------------
# Workout Completion Endpoints
# -------------------------
@router.post("/workouts/completion", response_model=WorkoutCompletionOut)
def log_workout_completion(entry: WorkoutCompletionIn, user_id: str = Depends(get_current_user_id)):
    """Log workout completion"""
    doc = entry.dict()
    doc["user_id"] = _oid(user_id)
    doc["completion_rate"] = (entry.exercises_completed / entry.exercises_planned * 100) if entry.exercises_planned > 0 else 0
    doc["created_at"] = datetime.utcnow()
    
    result = db.workout_completions.insert_one(doc)
    saved = db.workout_completions.find_one({"_id": result.inserted_id})
    
    # Check for badges
    _check_enhanced_badges(user_id)
    
    return WorkoutCompletionOut(
        id=str(saved["_id"]),
        user_id=user_id,
        **{k: saved.get(k) for k in ["date", "workout_id", "exercises_planned", "exercises_completed", "duration_minutes", "notes", "completion_rate", "created_at"]}
    )


@router.get("/workouts/completion", response_model=List[WorkoutCompletionOut])
def get_workout_completions(
    user_id: str = Depends(get_current_user_id),
    days: int = Query(30, description="Number of days to retrieve")
):
    """Get workout completions for the last N days"""
    start_date = (datetime.utcnow() - timedelta(days=days)).date()
    
    docs = db.workout_completions.find({
        "user_id": _oid(user_id),
        "date": {"$gte": start_date.isoformat()}
    }).sort("date", -1)
    
    return [
        WorkoutCompletionOut(
            id=str(d["_id"]),
            user_id=user_id,
            **{k: d.get(k) for k in ["date", "workout_id", "exercises_planned", "exercises_completed", "duration_minutes", "notes", "completion_rate", "created_at"]}
        )
        for d in docs
    ]


# -------------------------
# Enhanced Badge Endpoints
# -------------------------
@router.post("/badges/check")
def check_user_badges(user_id: str = Depends(get_current_user_id)):
    """Check and unlock badges for user, returns newly unlocked badges"""
    newly_unlocked = _check_enhanced_badges(user_id)
    return {
        "newly_unlocked": newly_unlocked,
        "count": len(newly_unlocked)
    }

@router.post("/badges/initialize")
def initialize_user_badges(user_id: str = Depends(get_current_user_id)):
    """Initialize all possible badges for user (locked state)"""
    initialized = []
    
    for badge_name, badge_info in ENHANCED_BADGE_RULES.items():
        # Check if badge already exists
        existing = db.badges.find_one({"user_id": _oid(user_id), "name": badge_name})
        if not existing:
            # Create locked badge
            badge_doc = {
                "user_id": _oid(user_id),
                "name": badge_name,
                "description": badge_info["description"],
                "icon": badge_info["icon"],
                "rarity": badge_info["rarity"],
                "category": badge_info["category"],
                "unlocked": False,
                "unlocked_date": None,
                "created_at": datetime.utcnow()
            }
            db.badges.insert_one(badge_doc)
            initialized.append(badge_name)
    
    # After initializing, check for immediate unlocks
    newly_unlocked = _check_enhanced_badges(user_id)
    
    return {
        "initialized": initialized,
        "newly_unlocked": newly_unlocked,
        "total_badges": len(ENHANCED_BADGE_RULES)
    }

@router.get("/badges/enhanced", response_model=List[EnhancedBadgeOut])
def get_enhanced_badges(user_id: str = Depends(get_current_user_id)):
    """Get enhanced badges with progress tracking - initializes badges if none exist"""
    
    # Check if user has any badges, if not initialize them
    existing_count = db.badges.count_documents({"user_id": _oid(user_id)})
    if existing_count == 0:
        # Initialize all badges as locked
        for badge_name, badge_info in ENHANCED_BADGE_RULES.items():
            badge_doc = {
                "user_id": _oid(user_id),
                "name": badge_name,
                "description": badge_info["description"],
                "icon": badge_info["icon"],
                "rarity": badge_info["rarity"],
                "category": badge_info["category"],
                "unlocked": False,
                "unlocked_date": None,
                "created_at": datetime.utcnow()
            }
            db.badges.insert_one(badge_doc)
        
        # Check for immediate unlocks
        _check_enhanced_badges(user_id)
    
    # Get all badges
    docs = db.badges.find({"user_id": _oid(user_id)}).sort([("unlocked", -1), ("unlocked_date", -1)])
    
    badges = []
    stats = None  # Lazy load stats only if needed
    
    for d in docs:
        # Calculate progress for locked badges
        progress = None
        if not d.get("unlocked", False):
            if stats is None:
                stats = _get_user_stats(user_id)
            badge_name = d["name"]
            if badge_name in ENHANCED_BADGE_RULES:
                requirements = ENHANCED_BADGE_RULES[badge_name]["requirements"]
                # Calculate progress based on requirements
                progress = _calculate_badge_progress(badge_name, requirements, stats)
        
        badges.append(EnhancedBadgeOut(
            id=str(d["_id"]),
            name=d["name"],
            description=d.get("description", ""),
            icon=d.get("icon", "🏆"),
            rarity=d.get("rarity", "common"),
            category=d.get("category", "general"),
            unlocked=d.get("unlocked", False),
            unlocked_date=d.get("unlocked_date"),
            progress=progress
        ))
    
    return badges


# -------------------------
# Dashboard Endpoint
# -------------------------
@router.get("/dashboard", response_model=DashboardMetrics)
def get_dashboard_metrics(user_id: str = Depends(get_current_user_id)):
    """Get comprehensive dashboard metrics"""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Workout completion metrics
    workout_completions = list(db.workout_completions.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    workout_completion_rate = 0
    if workout_completions:
        total_completion = sum(w.get("completion_rate", 0) for w in workout_completions)
        workout_completion_rate = total_completion / len(workout_completions)
    
    # Calorie intake metrics
    calorie_entries = list(db.calorie_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    avg_calories_consumed = 0
    avg_calories_recommended = 0
    if calorie_entries:
        avg_calories_consumed = sum(c.get("consumed", 0) for c in calorie_entries) / len(calorie_entries)
        avg_calories_recommended = sum(c.get("recommended", 0) for c in calorie_entries) / len(calorie_entries)
    
    # Macro breakdown metrics
    macro_entries = list(db.macro_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    avg_protein = 0
    avg_carbs = 0
    avg_fats = 0
    if macro_entries:
        avg_protein = sum(m.get("protein", 0) for m in macro_entries) / len(macro_entries)
        avg_carbs = sum(m.get("carbs", 0) for m in macro_entries) / len(macro_entries)
        avg_fats = sum(m.get("fats", 0) for m in macro_entries) / len(macro_entries)
    
    # Meal compliance metrics
    meal_entries = list(db.meal_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    meal_compliance_rate = 0
    if meal_entries:
        followed_meals = sum(1 for m in meal_entries if m.get("followed", False))
        meal_compliance_rate = (followed_meals / len(meal_entries) * 100) if meal_entries else 0
    
    # Activity trends (from realtime data)
    activity_trends = {
        "steps_today": 0,
        "steps_weekly_avg": 0,
        "calories_burned": 0,
        "active_minutes": 0
    }
    
    # Goal achievement metrics
    goals = list(db.goals.find({"user_id": _oid(user_id)}))
    total_goals = len(goals)
    completed_goals = sum(1 for g in goals if g.get("completed", False))
    goal_achievement_rate = (completed_goals / total_goals * 100) if total_goals > 0 else 0
    
    # Sleep and recovery metrics
    sleep_entries = list(db.sleep_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    avg_sleep_duration = 0
    avg_recovery_score = 0
    if sleep_entries:
        avg_sleep_duration = sum(s.get("duration", 0) for s in sleep_entries) / len(sleep_entries)
        avg_recovery_score = sum(s.get("recovery_score", 0) for s in sleep_entries) / len(sleep_entries)
    
    # Hydration trends
    hydration_entries = list(db.hydration_entries.find({
        "user_id": _oid(user_id),
        "date": {"$gte": week_ago.date().isoformat()}
    }))
    
    avg_hydration = 0
    hydration_target = 0
    if hydration_entries:
        avg_hydration = sum(h.get("consumed", 0) for h in hydration_entries) / len(hydration_entries)
        hydration_target = sum(h.get("target", 0) for h in hydration_entries) / len(hydration_entries)
    
    # Badges and streaks
    badges = list(db.badges.find({"user_id": _oid(user_id), "unlocked": True}))
    streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
    current_streak = streak_doc.get("current_streak", 0) if streak_doc else 0
    longest_streak = streak_doc.get("longest_streak", 0) if streak_doc else 0
    
    return DashboardMetrics(
        workout_completion={
            "completion_rate": workout_completion_rate,
            "workouts_this_week": len(workout_completions),
            "avg_duration": sum(w.get("duration_minutes", 0) for w in workout_completions) / len(workout_completions) if workout_completions else 0
        },
        calorie_intake={
            "consumed": avg_calories_consumed,
            "recommended": avg_calories_recommended,
            "deficit": avg_calories_recommended - avg_calories_consumed
        },
        macro_breakdown={
            "protein": avg_protein,
            "carbs": avg_carbs,
            "fats": avg_fats
        },
        meal_compliance={
            "compliance_rate": meal_compliance_rate,
            "meals_this_week": len(meal_entries)
        },
        activity_trends=activity_trends,
        goal_achievement={
            "achievement_rate": goal_achievement_rate,
            "completed_goals": completed_goals,
            "total_goals": total_goals
        },
        sleep_recovery={
            "avg_duration": avg_sleep_duration,
            "avg_recovery_score": avg_recovery_score,
            "entries_this_week": len(sleep_entries)
        },
        hydration_trends={
            "avg_consumed": avg_hydration,
            "target": hydration_target,
            "compliance_rate": (avg_hydration / hydration_target * 100) if hydration_target > 0 else 0
        },
        badges_streaks={
            "total_badges": len(badges),
            "current_streak": current_streak,
            "longest_streak": longest_streak
        }
    )


# -------------------------
# Helper Functions
# -------------------------
def _calculate_recovery_score(sleep_data: Dict[str, Any]) -> float:
    """Calculate recovery score based on sleep data"""
    duration = sleep_data.get("duration", 0)
    quality_scores = {"poor": 0.2, "fair": 0.4, "good": 0.7, "excellent": 1.0}
    quality = quality_scores.get(sleep_data.get("quality", "poor"), 0.2)
    
    # Base score from quality
    score = quality * 50
    
    # Duration bonus (optimal 7-9 hours)
    if 7 <= duration <= 9:
        score += 30
    elif 6 <= duration < 7 or 9 < duration <= 10:
        score += 20
    elif 5 <= duration < 6 or 10 < duration <= 11:
        score += 10
    
    # Awakenings penalty
    awakenings = sleep_data.get("awakenings", 0)
    if awakenings == 0:
        score += 20
    elif awakenings <= 2:
        score += 10
    elif awakenings <= 4:
        score += 5
    
    return min(100.0, max(0.0, score))


def _calculate_badge_progress(badge_name: str, requirements: Dict[str, Any], stats: Dict[str, Any]) -> float:
    """Calculate progress towards unlocking a badge"""
    try:
        if badge_name == "Workout Warrior":
            current = stats.get("workout_streak", 0)
            target = requirements["workout_streak"]
            return min(100.0, (current / target) * 100)
        elif badge_name == "Gym Legend":
            current = stats.get("workout_streak", 0)
            target = requirements["workout_streak"]
            return min(100.0, (current / target) * 100)
        elif badge_name == "Nutrition Master":
            current = stats.get("meal_compliance_30d", 0)
            target = requirements["meal_compliance"]
            return min(100.0, (current / target) * 100)
        elif badge_name == "Hydration Hero":
            current = stats.get("hydration_30d", 0)
            target = requirements["hydration_target"]
            return min(100.0, (current / target) * 100)
        elif badge_name == "Goal Crusher":
            current = stats.get("goals_completed", 0)
            target = requirements["goals_completed"]
            return min(100.0, (current / target) * 100)
        elif badge_name == "Consistency King":
            current = stats.get("total_streak", 0)
            target = requirements["total_streak"]
            return min(100.0, (current / target) * 100)
        else:
            return 0.0
    except Exception:
        return 0.0


def _calculate_goal_progress(user_id: str, goal: Dict[str, Any]) -> float:
    """Calculate current progress for a goal based on actual data"""
    title = goal.get("title", "").lower()
    category = goal.get("category", "").lower()
    
    try:
        # Nutrition goals
        if "calorie" in title or "calories" in title:
            # Count days meeting calorie goals in the last 30 days
            macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
            target_calories = macro_targets.get("calories", 2000) if macro_targets else 2000
            
            days_met = 0
            for i in range(30):
                day = (datetime.utcnow() - timedelta(days=i)).date()
                day_start = datetime.combine(day, datetime.min.time())
                day_end = day_start + timedelta(days=1)
                
                daily_calories = sum([
                    sum([item.get("calories", 0) for item in meal.get("items", [])])
                    for meal in db.meals.find({
                        "user_id": _oid(user_id),
                        "timestamp": {"$gte": day_start, "$lt": day_end}
                    })
                ])
                
                # Allow 10% tolerance
                if abs(daily_calories - target_calories) <= target_calories * 0.1:
                    days_met += 1
            
            return days_met
        
        elif "meal" in title and "log" in title:
            # Count total meals logged
            total_meals = db.meals.count_documents({"user_id": _oid(user_id)})
            return total_meals
        
        elif "protein" in title:
            # Count days meeting protein goals
            macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
            target_protein = macro_targets.get("protein_g", 150) if macro_targets else 150
            
            days_met = 0
            for i in range(30):
                day = (datetime.utcnow() - timedelta(days=i)).date()
                day_start = datetime.combine(day, datetime.min.time())
                day_end = day_start + timedelta(days=1)
                
                daily_protein = sum([
                    sum([item.get("protein_g", 0) for item in meal.get("items", [])])
                    for meal in db.meals.find({
                        "user_id": _oid(user_id),
                        "timestamp": {"$gte": day_start, "$lt": day_end}
                    })
                ])
                
                if daily_protein >= target_protein * 0.9:  # 90% of target
                    days_met += 1
            
            return days_met
        
        # Health goals
        elif "hydration" in title or "water" in title:
            # Count days meeting water goals
            macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
            calories = macro_targets.get("calories", 2000) if macro_targets else 2000
            water_goal_ml = int((calories / 1000) * 1000) + 500
            
            days_met = 0
            for i in range(30):
                day = (datetime.utcnow() - timedelta(days=i)).date()
                day_start = datetime.combine(day, datetime.min.time())
                day_end = day_start + timedelta(days=1)
                
                daily_water = sum([
                    log.get("amount_ml", 0) 
                    for log in db.water_logs.find({
                        "user_id": _oid(user_id),
                        "timestamp": {"$gte": day_start, "$lt": day_end}
                    })
                ])
                
                if daily_water >= water_goal_ml:
                    days_met += 1
            
            return days_met
        
        elif "sleep" in title:
            # Count days with good sleep (7-8 hours)
            days_met = db.sleep_entries.count_documents({
                "user_id": _oid(user_id),
                "duration": {"$gte": 7, "$lte": 9}
            })
            return days_met
        
        elif "step" in title:
            # Count days meeting step goals (from realtime data)
            # This would require integration with realtime tracking
            # For now, return current value
            return goal.get("current", 0)
        
        # Lifestyle goals
        elif "streak" in title or "routine" in title:
            # Use current streak from nutrition module
            streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
            return streak_doc.get("current_streak", 0) if streak_doc else 0
        
        elif "tracking" in title or "check-in" in title:
            # Count days with any logged data
            unique_dates = set()
            
            # Count meal logging dates
            for meal in db.meals.find({"user_id": _oid(user_id)}):
                if meal.get("timestamp"):
                    unique_dates.add(meal["timestamp"].date().isoformat())
            
            # Count water logging dates
            for log in db.water_logs.find({"user_id": _oid(user_id)}):
                if log.get("timestamp"):
                    unique_dates.add(log["timestamp"].date().isoformat())
            
            return len(unique_dates)
        
        else:
            # Return current value for custom goals
            return goal.get("current", 0)
    
    except Exception as e:
        print(f"Error calculating goal progress: {e}")
        return goal.get("current", 0)


def _create_default_goals(user_id: str):
    """Create default nutrition, health, and lifestyle goals for new users"""
    now = datetime.utcnow()
    deadline_30d = (now + timedelta(days=30)).date().isoformat()
    deadline_60d = (now + timedelta(days=60)).date().isoformat()
    deadline_90d = (now + timedelta(days=90)).date().isoformat()
    
    # Get user's macro targets for personalized goals
    macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)})
    water_goal = 2500  # Default 2.5L
    if macro_targets:
        calories = macro_targets.get("calories", 2000)
        water_goal = int((calories / 1000) * 1000) + 500
    
    default_goals = [
        # Nutrition Goals
        {
            "user_id": _oid(user_id),
            "title": "Maintain Daily Calorie Goals",
            "description": "Meet your daily calorie targets for 30 days",
            "target": 30,
            "current": 0,
            "deadline": deadline_30d,
            "category": "nutrition",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        {
            "user_id": _oid(user_id),
            "title": "Log Meals Consistently",
            "description": "Log at least 3 meals per day for 30 days",
            "target": 90,  # 3 meals x 30 days
            "current": 0,
            "deadline": deadline_30d,
            "category": "nutrition",
            "unit": "meals",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        {
            "user_id": _oid(user_id),
            "title": "Meet Protein Goals",
            "description": "Hit your daily protein target for 30 days",
            "target": 30,
            "current": 0,
            "deadline": deadline_30d,
            "category": "nutrition",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        # Health Goals
        {
            "user_id": _oid(user_id),
            "title": "Daily Hydration Goal",
            "description": f"Drink {water_goal}ml of water daily for 30 days",
            "target": 30,
            "current": 0,
            "deadline": deadline_30d,
            "category": "health",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        {
            "user_id": _oid(user_id),
            "title": "Quality Sleep Streak",
            "description": "Get 7-8 hours of quality sleep for 30 days",
            "target": 30,
            "current": 0,
            "deadline": deadline_30d,
            "category": "health",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        {
            "user_id": _oid(user_id),
            "title": "Daily Step Goal",
            "description": "Reach 10,000 steps daily for 60 days",
            "target": 60,
            "current": 0,
            "deadline": deadline_60d,
            "category": "health",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        # Lifestyle Goals
        {
            "user_id": _oid(user_id),
            "title": "Build a Healthy Routine",
            "description": "Maintain a 30-day streak of logging health data",
            "target": 30,
            "current": 0,
            "deadline": deadline_30d,
            "category": "lifestyle",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        },
        {
            "user_id": _oid(user_id),
            "title": "Wellness Check-ins",
            "description": "Complete 90 days of consistent health tracking",
            "target": 90,
            "current": 0,
            "deadline": deadline_90d,
            "category": "lifestyle",
            "unit": "days",
            "completed": False,
            "achievement_rate": 0.0,
            "created_at": now
        }
    ]
    
    # Insert all default goals
    for goal in default_goals:
        db.goals.insert_one(goal)
