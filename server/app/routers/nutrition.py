# app/routers/nutrition.py
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any, TypedDict, Union
import csv
import io
import os
import asyncio
import traceback
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Body, Response
from pydantic import BaseModel, Field
from bson import ObjectId

from app.database.connection import db
from app.auth import get_current_user_id
from bson import ObjectId as _BsonObjectId
from dotenv import load_dotenv
# Groq client assumed to be initialized in your project like in ai_workout.py
from groq import Groq

# Import langgraph for AI agent functionality
from langgraph.graph import StateGraph, END

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# List of models to try in order of preference
GROQ_MODELS = [
    "llama-3.3-70b-versatile",  # Llama 3.3 70B - Best for JSON generation
    "llama-3.1-70b-versatile",  # Llama 3.1 70B - Good backup
    "llama-3.1-8b-instant",     # Llama 3.1 8B - Fast and reliable
]

# Initialize logger first
logger = logging.getLogger(__name__)

# Use environment variable if set and valid, otherwise use first model in list
GROQ_MODEL = os.getenv("GROQ_MODEL")
if GROQ_MODEL and GROQ_MODEL not in GROQ_MODELS:
    logger.warning(f"Environment model {GROQ_MODEL} not in allowed list, using default")
    GROQ_MODEL = GROQ_MODELS[0]
elif not GROQ_MODEL:
    GROQ_MODEL = GROQ_MODELS[0]

groq_client = None
if GROQ_API_KEY:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        logger.info(f"Groq client initialized successfully with model: {GROQ_MODEL}")
    except Exception as e:
        logger.error(f"Failed to initialize Groq client: {e}")
        groq_client = None

router = APIRouter(prefix="/nutrition", tags=["Nutrition"])

# ---------- helpers ----------
def _oid(val: str):
    try:
        return ObjectId(val)
    except Exception:
        return val  # fallback if stored as string

def _now():
    return datetime.utcnow()

def _today_date_str():
    """Get today's date as ISO format string (YYYY-MM-DD) in UTC"""
    return datetime.utcnow().date().isoformat()

def _sync_nutrition_to_progress(user_id: str, meal_doc: dict):
    """Auto-sync nutrition data from meals to progress tracking collections"""
    try:
        today = _today_date_str()
        
        # Calculate totals for today
        all_meals_today = list(db.meals.find({
            "user_id": _oid(user_id),
            "timestamp": {
                "$gte": datetime.combine(datetime.utcnow().date(), datetime.min.time()),
                "$lte": datetime.combine(datetime.utcnow().date(), datetime.max.time())
            }
        }))
        
        total_calories = 0
        total_protein = 0
        total_carbs = 0
        total_fats = 0
        
        for meal in all_meals_today:
            items = meal.get("items", [])
            for item in items:
                total_calories += item.get("calories", 0) or 0
                total_protein += item.get("protein_g", 0) or 0
                total_carbs += item.get("carbs_g", 0) or 0
                total_fats += item.get("fats_g", 0) or 0
        
        # Get user's macro targets
        macro_targets = db.macro_targets.find_one({"user_id": _oid(user_id)}) or {}
        recommended_calories = macro_targets.get("calories", 2200)
        target_protein = macro_targets.get("protein_g", 150)
        target_carbs = macro_targets.get("carbs_g", 250)
        target_fats = macro_targets.get("fats_g", 67)
        
        # Update or create calorie entry for today
        db.calorie_entries.update_one(
            {"user_id": _oid(user_id), "date": today},
            {"$set": {
                "consumed": total_calories,
                "recommended": recommended_calories,
                "created_at": _now()
            }},
            upsert=True
        )
        
        # Update or create macro entry for today
        db.macro_entries.update_one(
            {"user_id": _oid(user_id), "date": today},
            {"$set": {
                "protein": total_protein,
                "carbs": total_carbs,
                "fats": total_fats,
                "protein_target": target_protein,
                "carbs_target": target_carbs,
                "fats_target": target_fats,
                "created_at": _now()
            }},
            upsert=True
        )
        
        # Check if meal followed the plan (compare with daily plan)
        daily_plan = db.nutrition_daily_plans.find_one({
            "user_id": _oid(user_id),
            "date": today
        })
        
        followed_plan = False
        planned = False
        if daily_plan and daily_plan.get("saved"):
            # Plan exists and was saved by user
            planned = True
            # Check if this meal matches any planned meal
            plan_meals = (daily_plan.get("plan", []) or []) + (daily_plan.get("snacks", []) or [])
            meal_title = meal_doc.get("notes", "").lower()
            for planned_meal in plan_meals:
                if planned_meal.get("title", "").lower() in meal_title:
                    followed_plan = True
                    break
        
        # Update or create meal compliance entry
        meal_name = ""
        if meal_doc.get("items") and len(meal_doc["items"]) > 0:
            meal_name = meal_doc["items"][0].get("name", "")
        elif meal_doc.get("food_name"):
            meal_name = meal_doc.get("food_name", "")
        
        db.meal_entries.update_one(
            {
                "user_id": _oid(user_id),
                "date": today,
                "meal_name": meal_name,
                "time": meal_doc.get("timestamp", _now()).strftime("%H:%M") if isinstance(meal_doc.get("timestamp"), datetime) else _now().strftime("%H:%M")
            },
            {"$set": {
                "planned": planned,
                "followed": followed_plan,
                "notes": meal_doc.get("notes", ""),
                "created_at": _now()
            }},
            upsert=True
        )
        
        # Update streak tracking
        _update_nutrition_streak(user_id)
        
        logger.info(f"Synced nutrition data to progress for user {user_id} on {today}")
    except Exception as e:
        logger.error(f"Failed to sync nutrition to progress: {e}", exc_info=True)

def _update_nutrition_streak(user_id: str):
    """Update user's nutrition/login streak"""
    try:
        today = _today_date_str()
        yesterday = (datetime.utcnow().date() - timedelta(days=1)).isoformat()
        
        streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
        
        if not streak_doc:
            # Create new streak document
            db.streaks.insert_one({
                "user_id": _oid(user_id),
                "current_streak": 1,
                "longest_streak": 1,
                "last_activity_date": today,
                "created_at": _now(),
                "updated_at": _now()
            })
        else:
            last_activity = streak_doc.get("last_activity_date")
            current_streak = streak_doc.get("current_streak", 0)
            longest_streak = streak_doc.get("longest_streak", 0)
            
            if last_activity == today:
                # Already logged today, no update needed
                return
            elif last_activity == yesterday:
                # Consecutive day, increment streak
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                # Streak broken, reset to 1
                current_streak = 1
            
            db.streaks.update_one(
                {"user_id": _oid(user_id)},
                {"$set": {
                    "current_streak": current_streak,
                    "longest_streak": longest_streak,
                    "last_activity_date": today,
                    "updated_at": _now()
                }}
            )
            
            logger.info(f"Updated streak for user {user_id}: current={current_streak}, longest={longest_streak}")
    except Exception as e:
        logger.error(f"Failed to update nutrition streak: {e}", exc_info=True)

def _sync_water_to_progress(user_id: str):
    """Auto-sync water intake data to progress tracking"""
    try:
        today = _today_date_str()
        
        # Calculate total water intake for today
        today_start = datetime.combine(datetime.utcnow().date(), datetime.min.time())
        today_end = datetime.combine(datetime.utcnow().date(), datetime.max.time())
        
        water_logs_today = list(db.water_logs.find({
            "user_id": _oid(user_id),
            "timestamp": {"$gte": today_start, "$lte": today_end}
        }))
        
        total_consumed = sum(log.get("amount_ml", 0) for log in water_logs_today)
        
        # Get water goal (from nutrition profile or daily plan)
        profile = db.nutrition_profiles.find_one({"user_id": _oid(user_id)}) or {}
        macros = db.macro_targets.find_one({"user_id": _oid(user_id)}) or {}
        
        # Try to get water goal from daily plan first
        daily_plan = db.nutrition_daily_plans.find_one({
            "user_id": _oid(user_id),
            "date": today
        })
        
        water_target = 2500  # Default 2.5L
        if daily_plan and daily_plan.get("water_goal_ml"):
            water_target = daily_plan["water_goal_ml"]
        else:
            # Compute water goal based on profile (simplified logic)
            calories = macros.get("calories", 2200)
            water_target = max(2000, min(4000, int(calories * 1.1)))  # Rough estimate: calories * 1.1ml
        
        # Calculate bottles (assuming 500ml per bottle)
        bottles = int(total_consumed / 500)
        
        # Update or create hydration entry for today
        db.hydration_entries.update_one(
            {"user_id": _oid(user_id), "date": today},
            {"$set": {
                "consumed": total_consumed,
                "target": water_target,
                "bottles": bottles,
                "reminders": 0,  # Could be enhanced to track reminders
                "created_at": _now()
            }},
            upsert=True
        )
        
        logger.info(f"Synced water data to progress for user {user_id}: consumed={total_consumed}ml, target={water_target}ml")
    except Exception as e:
        logger.error(f"Failed to sync water to progress: {e}", exc_info=True)

# ---------- Pydantic models ----------
class FoodItem(BaseModel):
    name: str
    serving_size: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fats_g: Optional[float] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None  # future: link to stored image

class MealLogIn(BaseModel):
    meal_type: str  # "breakfast", "lunch", "dinner", "snack"
    timestamp: Optional[datetime] = None
    items: List[FoodItem] = Field(default_factory=list)
    notes: Optional[str] = None

class SimpleMealLogIn(BaseModel):
    """Simplified meal log model for backward compatibility with tests"""
    meal_type: str
    food_name: str
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fats_g: Optional[float] = None
    timestamp: Optional[datetime] = None
    notes: Optional[str] = None

class MealLogOut(BaseModel):
    id: str
    user_id: str
    meal_type: str
    timestamp: datetime
    created_at: datetime
    updated_at: datetime
    # Support both formats in output
    items: Optional[List[FoodItem]] = None
    notes: Optional[str] = None
    # Simple format fields for backward compatibility
    food_name: Optional[str] = None
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fats_g: Optional[float] = None

class WaterLogIn(BaseModel):
    amount_ml: int
    timestamp: Optional[datetime] = None

class WaterLogOut(WaterLogIn):
    id: str
    user_id: str
    created_at: datetime

class MacroTargetsIn(BaseModel):
    calories: Optional[int] = None
    protein_g: Optional[int] = None
    carbs_g: Optional[int] = None
    fats_g: Optional[int] = None
    # preferences
    diet_pref: Optional[str] = None  # e.g., "vegan", "keto", etc.
    exclude_foods: Optional[List[str]] = []

class MacroTargetsOut(MacroTargetsIn):
    id: str
    user_id: str
    updated_at: datetime

class MealSwapRequest(BaseModel):
    meal_id: Optional[str] = None  # the meal user wants to swap from (optional)
    reason: Optional[str] = None   # user reason for swap (e.g., "too heavy", "allergy")
    desired_profile: Optional[Dict[str, Any]] = None  # overrides like {"calories": 400, "protein_g": 30}
    # Additional fields for test compatibility
    meal_type: Optional[str] = None
    current_meal_title: Optional[str] = None
    alternatives_count: Optional[int] = 5
    swap_in_title: Optional[str] = None
    slot_index: Optional[int] = None
    is_snack: Optional[bool] = None
    swap_in_meal: Optional[Dict[str, Any]] = None

class GenerateRecipeRequest(BaseModel):
    target_calories: Optional[int] = None
    protein_g: Optional[int] = None
    carbs_g: Optional[int] = None
    fats_g: Optional[int] = None
    diet_pref: Optional[str] = None
    title_hint: Optional[str] = None

class GeneratedRecipe(BaseModel):
    title: str
    ingredients: List[str]
    steps: List[str]
    calories: Optional[int] = None
    protein_g: Optional[int] = None
    carbs_g: Optional[int] = None
    fats_g: Optional[int] = None


# ---------- Agent state models ----------
class MealPlanEntry(TypedDict, total=False):
    meal_type: str
    title: str
    calories: Optional[int]
    protein_g: Optional[int]
    carbs_g: Optional[int]
    fats_g: Optional[int]
    ingredients: Optional[List[str]]
    steps: Optional[List[str]]


class DietAgentState(TypedDict, total=False):
    user_id: str
    profile: Optional[dict]
    macro_targets: Optional[dict]
    meal_logs: List[dict]
    compliance_summary: Optional[dict]
    daily_plan: List[MealPlanEntry]
    snack_plan: List[MealPlanEntry]
    swap_context: Optional[dict]
    suggestions: Optional[List[str]]
    debug: Optional[List[str]]

# ---------- DB helpers ----------
def _ensure_indexes():
    # idempotent index creation
    try:
        db.meals.create_index([("user_id", 1), ("meal_type", 1), ("timestamp", 1)])
        db.water_logs.create_index([("user_id", 1), ("timestamp", 1)])
        db.macro_targets.create_index([("user_id", 1)], unique=True)
    except Exception:
        pass


def _get_nutrition_profile(user_id: str) -> Optional[dict]:
    return db.nutrition_profiles.find_one({"user_id": _oid(user_id)})


def _get_macro_targets(user_id: str) -> Optional[dict]:
    return db.macro_targets.find_one({"user_id": _oid(user_id)})

def _sanitize_for_json(obj: Any) -> Any:
    """Sanitize object for JSON serialization by converting ObjectIds to strings"""
    if isinstance(obj, dict):
        sanitized = {}
        for k, v in obj.items():
            if k == "_id":
                continue  # Skip MongoDB _id field
            sanitized[k] = _sanitize_for_json(v)
        return sanitized
    elif isinstance(obj, list):
        return [_sanitize_for_json(item) for item in obj]
    elif isinstance(obj, _BsonObjectId):
        return str(obj)
    elif hasattr(obj, "isoformat"):
        try:
            return obj.isoformat()
        except Exception:
            return str(obj)
    else:
        return obj


def _seed_default_macros(user_id: str, profile: Dict[str, Any]) -> dict:
    now = _now()
    
    # Try to get AI-predicted calories from onboarding data first
    calories = 2000  # Safe default
    try:
        user = db.users.find_one({"_id": _oid(user_id)})
        if user and user.get("onboarding") and user["onboarding"].get("ai_assessment"):
            ai_assessment = user["onboarding"]["ai_assessment"]
            if ai_assessment.get("predicted_calories"):
                calories = int(ai_assessment["predicted_calories"])
                print(f"Using AI-predicted calories: {calories} for user {user_id}")
    except Exception as e:
        print(f"Could not get AI-predicted calories, using estimation: {e}")
    
    # If no AI calories found, estimate based on meals/snacks (fallback)
    if calories == 2000:
        meals = int(profile.get("meals_per_day") or 3)
        snacks = int(profile.get("snacks_per_day") or 0)
        calories = 1800 + meals * 150 + snacks * 100
        print(f"Using estimated calories based on meals/snacks: {calories}")
    
    # Calculate macros based on calories (40% carbs, 30% protein, 30% fat)
    protein = int((calories * 0.30) / 4)  # 4 cal per gram protein
    carbs = int((calories * 0.40) / 4)  # 4 cal per gram carbs
    fats = int((calories * 0.30) / 9)  # 9 cal per gram fat
    
    default_doc = {
        "user_id": _oid(user_id),
        "calories": calories,
        "protein_g": protein,
        "carbs_g": carbs,
        "fats_g": fats,
        "diet_pref": profile.get("diet_type"),
        "exclude_foods": profile.get("allergies", []),
        "created_at": now,
        "updated_at": now,
    }
    res = db.macro_targets.insert_one(default_doc)
    default_doc["_id"] = res.inserted_id
    return default_doc


def _compute_water_goal(profile: Dict[str, Any], macros: Dict[str, Any]) -> int:
    meals = int(profile.get("meals_per_day") or 3)
    snacks = int(profile.get("snacks_per_day") or 0)
    calories = float(macros.get("calories") or 2000)

    base = max(2000, min(4000, calories * 1.1))  # adjust base by calories
    per_meal = meals * 250
    per_snack = snacks * 150
    goal = int(max(2000, min(5000, base + per_meal + per_snack)))
    return goal


def _aggregate_plan_macros(meals: List[MealPlanEntry], snacks: List[MealPlanEntry]) -> Dict[str, float]:
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fats_g": 0.0}
    for entry in list(meals) + list(snacks):
        for key in totals:
            value = entry.get(key)
            if value is not None:
                try:
                    totals[key] += float(value)
                except (TypeError, ValueError):
                    continue
    return {k: round(v, 2) for k, v in totals.items()}


# Unit conversion factors to standard units (grams for solids, ml for liquids)
UNIT_CONVERSIONS = {
    # Volume units to ml
    'cup': 240, 'cups': 240,
    'tbsp': 15, 'tablespoon': 15, 'tablespoons': 15,
    'tsp': 5, 'teaspoon': 5, 'teaspoons': 5,
    'fl oz': 30, 'fluid ounce': 30,
    'pint': 473, 'quart': 946, 'gallon': 3785,
    # Weight units to grams
    'lb': 454, 'pound': 454, 'pounds': 454,
    'oz': 28, 'ounce': 28, 'ounces': 28,
    'kg': 1000, 'kilogram': 1000,
    'g': 1, 'gram': 1, 'grams': 1,
    # Count units (no conversion needed)
    'piece': 1, 'pieces': 1,
    'medium': 1, 'large': 1, 'small': 1,
    'whole': 1, 'half': 0.5, 'quarter': 0.25,
    'handful': 1, 'bunch': 1, 'stalk': 1, 'stalks': 1,
    'clove': 1, 'cloves': 1,
}

# Practical shopping sizes for common items
PRACTICAL_SIZES = {
    # Oils and liquids (ml)
    'olive oil': [100, 250, 500, 1000],
    'vegetable oil': [100, 250, 500, 1000],
    'soy sauce': [150, 300, 500],
    'vinegar': [250, 500, 1000],
    # Grains and flours (grams)
    'rice': [500, 1000, 2000],
    'quinoa': [250, 500, 1000],
    'pasta': [250, 500, 1000],
    'flour': [500, 1000, 2000],
    'oats': [250, 500, 1000],
    # Canned goods (count)
    'tomato': [400],  # canned tomatoes
    'beans': [400],  # canned beans
    'tuna': [100],  # canned tuna
    # Dairy (ml/grams)
    'milk': [1000, 2000],
    'cheese': [200, 500, 1000],
    'yogurt': [150, 500, 1000],
    # Produce (count/kg)
    'apple': [1, 2, 5],
    'banana': [1, 3, 6],
    'orange': [1, 3, 6],
    'potato': [500, 1000, 2000],
    'onion': [500, 1000],
    'garlic': [1, 3, 5],  # bulbs
    # Proteins (grams)
    'chicken': [500, 1000, 2000],
    'beef': [500, 1000, 2000],
    'fish': [200, 500, 1000],
    'tofu': [200, 400, 800],
    'eggs': [6, 12, 18],
    # Nuts and seeds (grams)
    'almonds': [100, 250, 500],
    'walnuts': [100, 250, 500],
    'chia seeds': [100, 250, 500],
}

def _parse_ingredient(ingredient: str) -> tuple[float, str, str]:
    """Parse ingredient string like '1 cup rice' into (quantity, unit, item)"""
    import re
    ingredient = ingredient.strip().lower()

    # Handle special cases first
    if ingredient in ['salt', 'pepper', 'herbs and spices to taste']:
        return 1, 'to taste', ingredient

    # Pattern: "2 cups cooked quinoa" -> (2, 'cup', 'quinoa')
    # Pattern: "150 g grilled chicken breast" -> (150, 'g', 'chicken breast')
    # Pattern: "1 tbsp olive oil" -> (1, 'tbsp', 'olive oil')
    pattern = r'^(\d+(?:\.\d+)?)\s*(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|fl oz|fluid ounce|pint|quart|gallon|lb|pound|pounds|oz|ounce|ounces|kg|kilogram|g|gram|grams|piece|pieces|medium|large|small|whole|half|quarter|handful|bunch|stalk|stalks|clove|cloves)\s+(.+)$'
    match = re.match(pattern, ingredient)

    if match:
        quantity = float(match.group(1))
        unit = match.group(2)
        item = match.group(3).strip()
        return quantity, unit, item

    # Handle cases without explicit quantities
    if any(word in ingredient for word in ['handful', 'bunch', 'stalk', 'cloves']):
        return 1, 'count', ingredient

    # Default fallback
    return 1, 'item', ingredient

def _convert_to_standard_units(quantity: float, unit: str, item: str) -> float:
    """Convert various units to standard units (grams for solids, ml for liquids)"""
    unit_lower = unit.lower()

    # Handle count-based items
    if unit_lower in ['to taste', 'count', 'item', 'medium', 'large', 'small', 'whole', 'half', 'quarter']:
        return quantity

    # Convert to ml for liquids
    if unit_lower in ['cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'fl oz', 'fluid ounce', 'pint', 'quart', 'gallon']:
        return quantity * UNIT_CONVERSIONS.get(unit_lower, 1)

    # Convert to grams for solids
    if unit_lower in ['lb', 'pound', 'pounds', 'oz', 'ounce', 'ounces', 'kg', 'kilogram', 'g', 'gram', 'grams']:
        return quantity * UNIT_CONVERSIONS.get(unit_lower, 1)

    return quantity

def _convert_to_practical_quantity(standard_quantity: float, item: str) -> str:
    """Convert standard quantity to practical shopping quantity"""
    item_lower = item.lower()

    # For items with predefined practical sizes, round to nearest size
    if item_lower in PRACTICAL_SIZES:
        sizes = PRACTICAL_SIZES[item_lower]
        # Find the smallest size that can accommodate the quantity
        for size in sorted(sizes):
            if standard_quantity <= size:
                return f"{size}g" if size < 1000 else f"{size//1000}kg"

    # Default logic based on quantity ranges
    if standard_quantity < 50:
        return "small amount"
    elif standard_quantity < 200:
        return f"{round(standard_quantity)}g"
    elif standard_quantity < 1000:
        return f"{round(standard_quantity)}g"
    else:
        return f"{round(standard_quantity / 1000)}kg"

def _grocery_list_from_plan(meals: List[MealPlanEntry], snacks: List[MealPlanEntry]) -> List[str]:
    """
    Generate an improved grocery list that:
    1. Parses quantities from ingredients
    2. Groups similar items and sums quantities
    3. Converts to practical shopping quantities
    """
    from collections import defaultdict

    # Aggregate ingredients
    aggregated = defaultdict(float)

    for entry in list(meals) + list(snacks):
        for ingredient in entry.get("ingredients", []) or []:
            if not ingredient.strip():
                continue

            quantity, unit, item = _parse_ingredient(ingredient)

            # Clean up item name (remove descriptors like "grilled", "cooked", etc.)
            clean_item = item
            for word in ['grilled', 'cooked', 'raw', 'fresh', 'dried', 'chopped', 'sliced', 'diced']:
                clean_item = clean_item.replace(word, '').strip()

            # Convert to standard units
            standard_quantity = _convert_to_standard_units(quantity, unit, clean_item)

            # Aggregate
            aggregated[clean_item] += standard_quantity

    # Generate practical grocery list
    grocery_items = []
    for item, total_quantity in sorted(aggregated.items()):
        if total_quantity <= 0:
            continue

        practical_quantity = _convert_to_practical_quantity(total_quantity, item)

        # Format the grocery item
        if practical_quantity == "small amount":
            grocery_items.append(f"{item} (to taste)")
        elif practical_quantity.endswith('g') or practical_quantity.endswith('kg'):
            grocery_items.append(f"{practical_quantity} {item}")
        else:
            grocery_items.append(f"{item}")

    return grocery_items


# ---------- AI: Single meal generation (for swaps) ----------
async def _generate_detailed_meal(meal_type: str, title: str, target_macros: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a single detailed meal object with calories, macros, quantified ingredients, and steps.
    Returns a dict matching MealPlanEntry fields.
    """
    # If AI is unavailable, return a simple structured fallback
    if not groq_client:
        meal_type_lower = meal_type.lower()
        if "snack" in meal_type_lower:
            return {
                "meal_type": meal_type,
                "title": title,
                "calories": target_macros.get("calories", 180),
                "protein_g": target_macros.get("protein_g", 8),
                "carbs_g": target_macros.get("carbs_g", 20),
                "fats_g": target_macros.get("fats_g", 10),
                "ingredients": [
                    "1 medium apple",
                    "1 tbsp almond butter",
                    "handful of almonds",
                ],
                "steps": [
                    "Slice apple into wedges",
                    "Spread almond butter on apple slices",
                    "Sprinkle almonds on top",
                    "Enjoy immediately",
                ],
            }
        else:
            return {
                "meal_type": meal_type,
                "title": title,
                "calories": target_macros.get("calories", 450),
                "protein_g": target_macros.get("protein_g", 30),
                "carbs_g": target_macros.get("carbs_g", 45),
                "fats_g": target_macros.get("fats_g", 18),
                "ingredients": [
                    "150 g grilled chicken breast",
                    "1 cup cooked quinoa",
                    "2 cups mixed vegetables",
                    "1 tbsp olive oil",
                    "herbs and spices to taste",
                ],
                "steps": [
                    "Season and grill chicken breast for 8-10 minutes",
                    "Cook quinoa according to package instructions",
                    "Steam or roast mixed vegetables",
                    "Combine all ingredients",
                    "Serve hot",
                ],
            }

    # Create meal-type specific prompts for better variety
    meal_type_lower = meal_type.lower()
    if "snack" in meal_type_lower:
        base_prompt = "Create a healthy, satisfying snack recipe that is quick to prepare (under 10 minutes). "
        base_prompt += "Focus on portion control and nutritional balance suitable for snacking between meals. "
        prep_time = "2-5 minutes"
    else:
        base_prompt = "Create a complete, balanced meal recipe suitable for breakfast, lunch, or dinner. "
        base_prompt += "Include a good balance of protein, carbs, and vegetables for sustained energy. "
        prep_time = "15-25 minutes"

    # Get user preferences for better personalization (profile is already sanitized)
    favorite_cuisines = profile.get("favorite_cuisines", [])
    diet_pref = profile.get("diet_type")

    system = (
        f"You are a professional nutritionist and recipe writer. {base_prompt}"
        "Create unique, creative recipes that incorporate the user's preferred cuisines where possible. "
        "Always return STRICT JSON object for a single meal "
        "with keys: meal_type, title, calories, protein_g, carbs_g, fats_g, ingredients (quantified with specific amounts), steps (actionable with times/temperatures)."
    )
    payload = {
        "meal_type": meal_type,
        "title": title,
        "target_macros": {
            k: float(v) for k, v in target_macros.items() if v is not None and k in {"calories", "protein_g", "carbs_g", "fats_g"}
        },
        "diet_pref": diet_pref,
        "allergies": profile.get("allergies", []),
        "favorite_cuisines": favorite_cuisines,
        "prep_time": prep_time,
        "creativity_instructions": [
            "Use unique ingredient combinations not commonly paired together",
            "Incorporate different cooking techniques and cultural flavors",
            "Vary the protein sources, grain types, and vegetable selections",
            "Create distinctive flavor profiles for each recipe",
            "Ensure nutritional balance while maximizing taste variety"
        ],
        "variety_seed": str(datetime.utcnow().timestamp()),  # True randomization
    }
    comp = await _call_groq_chat(system, json.dumps(payload), temperature=0.25, max_tokens=700)
    text = comp.choices[0].message.content or ""
    parsed = _extract_json_from_text(text)
    if not parsed or not isinstance(parsed, dict):
        # Fallback structured meal if AI parsing fails (meal-type specific)
        meal_type_lower = meal_type.lower()
        if "snack" in meal_type_lower:
            # Create varied snack recipes based on title hash for uniqueness
            title_hash = hash(title) % 4
            snack_variants = [
                {
                    "ingredients": ["1 medium pear", "2 tbsp almond butter", "handful of walnuts"],
                    "steps": ["Slice pear into wedges", "Spread almond butter on pear slices", "Sprinkle walnuts on top", "Enjoy as a satisfying snack"]
                },
                {
                    "ingredients": ["1 cup Greek yogurt", "1/2 cup mixed berries", "1 tbsp chia seeds"],
                    "steps": ["Mix yogurt with berries", "Sprinkle chia seeds on top", "Let sit for 2 minutes", "Enjoy chilled"]
                },
                {
                    "ingredients": ["2 celery stalks", "2 tbsp cream cheese", "handful of raisins"],
                    "steps": ["Spread cream cheese on celery", "Top with raisins", "Cut into pieces if desired", "Enjoy as a crunchy snack"]
                },
                {
                    "ingredients": ["1 oz cheddar cheese", "whole grain crackers", "cherry tomatoes"],
                    "steps": ["Cut cheese into small pieces", "Arrange on crackers", "Add tomato slices", "Enjoy as a savory snack"]
                }
            ]
            variant = snack_variants[title_hash]
            return {
                "meal_type": meal_type,
                "title": title,
                "calories": target_macros.get("calories", 180),
                "protein_g": target_macros.get("protein_g", 8),
                "carbs_g": target_macros.get("carbs_g", 20),
                "fats_g": target_macros.get("fats_g", 10),
                "ingredients": variant["ingredients"],
                "steps": variant["steps"],
            }
        else:
            # Create varied meal recipes based on title hash for uniqueness
            title_hash = hash(title) % 4
            meal_variants = [
                {
                    "ingredients": ["150 g salmon fillet", "1 cup quinoa", "2 cups asparagus", "1 tbsp olive oil", "lemon juice"],
                    "steps": ["Season salmon with salt and pepper", "Cook quinoa according to package", "Roast asparagus at 400°F for 12 minutes", "Pan-sear salmon for 4 minutes per side", "Serve together"]
                },
                {
                    "ingredients": ["150 g ground turkey", "1 cup brown rice", "1 bell pepper", "1 zucchini", "spices"],
                    "steps": ["Brown turkey in a pan", "Cook rice separately", "Sauté vegetables", "Combine all ingredients", "Season with herbs and serve"]
                },
                {
                    "ingredients": ["200 g chickpeas", "1 cup couscous", "2 cups spinach", "feta cheese", "olive oil dressing"],
                    "steps": ["Cook couscous in boiling water", "Drain and rinse chickpeas", "Sauté spinach briefly", "Combine all ingredients", "Top with feta and dressing"]
                },
                {
                    "ingredients": ["150 g tofu", "1 sweet potato", "broccoli florets", "soy sauce", "sesame oil"],
                    "steps": ["Bake sweet potato at 400°F for 25 minutes", "Stir-fry tofu and broccoli", "Combine with cooked sweet potato", "Season with soy sauce and sesame oil", "Serve hot"]
                }
            ]
            variant = meal_variants[title_hash]
            return {
                "meal_type": meal_type,
                "title": title,
                "calories": target_macros.get("calories", 450),
                "protein_g": target_macros.get("protein_g", 30),
                "carbs_g": target_macros.get("carbs_g", 45),
                "fats_g": target_macros.get("fats_g", 18),
                "ingredients": variant["ingredients"],
                "steps": variant["steps"],
            }
    # Normalize and coerce types
    return {
        "meal_type": str(parsed.get("meal_type") or meal_type),
        "title": str(parsed.get("title") or title),
        "calories": parsed.get("calories", target_macros.get("calories")),
        "protein_g": parsed.get("protein_g", target_macros.get("protein_g")),
        "carbs_g": parsed.get("carbs_g", target_macros.get("carbs_g")),
        "fats_g": parsed.get("fats_g", target_macros.get("fats_g")),
        "ingredients": [str(x).strip() for x in (parsed.get("ingredients") or []) if str(x).strip()],
        "steps": [str(x).strip() for x in (parsed.get("steps") or []) if str(x).strip()],
    }


def _ensure_plan_length(target: int, plan: List[MealPlanEntry], fallback: List[MealPlanEntry]) -> List[MealPlanEntry]:
    result: List[MealPlanEntry] = []
    for i in range(target):
        source = plan[i] if i < len(plan) else MealPlanEntry()
        fill = fallback[i] if i < len(fallback) else fallback[-1] if fallback else MealPlanEntry()
        merged: MealPlanEntry = MealPlanEntry(
            meal_type=source.get("meal_type") or fill.get("meal_type") or f"Meal {i + 1}",
            title=source.get("title") or fill.get("title") or f"Meal {i + 1}",
            calories=source.get("calories") or fill.get("calories"),
            protein_g=source.get("protein_g") or fill.get("protein_g"),
            carbs_g=source.get("carbs_g") or fill.get("carbs_g"),
            fats_g=source.get("fats_g") or fill.get("fats_g"),
            ingredients=source.get("ingredients") or fill.get("ingredients") or ["Protein source", "Carbs", "Vegetables"],
            steps=source.get("steps") or fill.get("steps") or ["Prep ingredients", "Cook thoroughly", "Serve"],
        )
        result.append(merged)
    return result


MEAL_LABELS = ["Breakfast", "Lunch", "Dinner", "Supper", "Meal"]
SNACK_LABELS = ["Morning Snack", "Afternoon Snack", "Evening Snack", "Snack"]


def _build_fallback_plan(profile: dict, macros: dict) -> Dict[str, List[MealPlanEntry]]:
    meals_per_day = int(profile.get("meals_per_day") or 3)
    snacks_per_day = int(profile.get("snacks_per_day") or 0)
    meals_per_day = max(1, min(8, meals_per_day))
    snacks_per_day = max(0, min(6, snacks_per_day))

    total_cal = float(macros.get("calories") or 0)
    total_protein = float(macros.get("protein_g") or 0)
    total_carbs = float(macros.get("carbs_g") or 0)
    total_fats = float(macros.get("fats_g") or 0)

    def _portion(total: float, count: int) -> Optional[float]:
        if total and count:
            return round(total / count, 2)
        if total:
            return round(total, 2)
        return None

    meal_entries: List[MealPlanEntry] = []
    for idx in range(meals_per_day):
        label = MEAL_LABELS[idx] if idx < len(MEAL_LABELS) else f"Meal {idx + 1}"
        meal_entries.append(MealPlanEntry(
            meal_type=label,
            title=f"Balanced {label}",
            calories=_portion(total_cal, meals_per_day),
            protein_g=_portion(total_protein, meals_per_day),
            carbs_g=_portion(total_carbs, meals_per_day),
            fats_g=_portion(total_fats, meals_per_day),
            ingredients=["Lean protein", "Complex carbs", "Healthy fats", "Vegetables"],
            steps=["Assemble ingredients", "Cook with minimal oil", "Serve with vegetables"],
        ))

    snack_entries: List[MealPlanEntry] = []
    for idx in range(snacks_per_day):
        label = SNACK_LABELS[idx] if idx < len(SNACK_LABELS) else f"Snack {idx + 1}"
        snack_entries.append(MealPlanEntry(
            meal_type=label,
            title=f"Light {label}",
            calories=_portion(total_cal * 0.2, snacks_per_day) if total_cal else None,
            protein_g=_portion(total_protein * 0.1, snacks_per_day) if total_protein else None,
            carbs_g=_portion(total_carbs * 0.1, snacks_per_day) if total_carbs else None,
            fats_g=_portion(total_fats * 0.1, snacks_per_day) if total_fats else None,
            ingredients=["Fruit", "Nuts", "Yogurt"],
            steps=["Combine ingredients", "Serve chilled"],
        ))

    return {"daily_plan": meal_entries, "snack_plan": snack_entries}


@router.on_event("startup")
async def _startup_indexes():
    _ensure_indexes()
    try:
        db.nutrition_profiles.create_index([("user_id", 1)], unique=True, name="ux_nutrition_profile_user")
    except Exception:
        pass
    try:
        # Create unique compound index on nutrition_daily_plans to prevent duplicate plans for same user+date
        db.nutrition_daily_plans.create_index([("user_id", 1), ("date", 1)], unique=True, name="ux_daily_plan_user_date")
    except Exception:
        pass

# ---------- CRUD: Meal Logs ----------
@router.post("/meals", response_model=MealLogOut)
def create_meal(payload: Union[MealLogIn, SimpleMealLogIn], user_id: str = Depends(get_current_user_id)):
    now = _now()
    
    # Handle both complex and simple meal log formats
    if hasattr(payload, 'food_name'):
        # Simple format - convert to complex format internally
        simple_payload = payload
        doc = {
            "user_id": _oid(user_id),
            "meal_type": simple_payload.meal_type.lower(),
            "timestamp": simple_payload.timestamp or now,
            "items": [{
                "name": simple_payload.food_name,
                "calories": simple_payload.calories,
                "protein_g": simple_payload.protein_g,
                "carbs_g": simple_payload.carbs_g,
                "fats_g": simple_payload.fats_g,
                "notes": simple_payload.notes
            }],
            "notes": simple_payload.notes,
            "created_at": now,
            "updated_at": now,
            # Store simple format fields for backward compatibility
            "food_name": simple_payload.food_name,
            "calories": simple_payload.calories,
            "protein_g": simple_payload.protein_g,
            "carbs_g": simple_payload.carbs_g,
            "fats_g": simple_payload.fats_g,
        }
    else:
        # Complex format
        doc = {
            "user_id": _oid(user_id),
            "meal_type": payload.meal_type.lower(),
            "timestamp": payload.timestamp or now,
            "items": [item.dict() for item in payload.items],
            "notes": payload.notes,
            "created_at": now,
            "updated_at": now,
        }
    
    res = db.meals.insert_one(doc)
    saved = db.meals.find_one({"_id": res.inserted_id})
    
    # Auto-sync nutrition data to progress tracking
    _sync_nutrition_to_progress(user_id, saved)
    
    return MealLogOut(
        id=str(saved["_id"]),
        user_id=str(saved["user_id"]),
        meal_type=saved["meal_type"],
        timestamp=saved["timestamp"],
        items=saved.get("items", []),
        notes=saved.get("notes"),
        created_at=saved["created_at"],
        updated_at=saved["updated_at"],
        # Include simple format fields if they exist
        food_name=saved.get("food_name"),
        calories=saved.get("calories"),
        protein_g=saved.get("protein_g"),
        carbs_g=saved.get("carbs_g"),
        fats_g=saved.get("fats_g"),
    )

@router.get("/meals", response_model=List[MealLogOut])
def list_meals(user_id: str = Depends(get_current_user_id), start: Optional[str] = None, end: Optional[str] = None):
    q = {"user_id": _oid(user_id)}
    if start:
        try:
            # Handle both string and date inputs
            if isinstance(start, str):
                start_date = datetime.strptime(start, "%Y-%m-%d").date()
            else:
                start_date = start
            q["timestamp"] = {"$gte": datetime.combine(start_date, datetime.min.time())}
        except ValueError:
            # If date parsing fails, ignore the filter
            pass
    if end:
        try:
            # Handle both string and date inputs
            if isinstance(end, str):
                end_date = datetime.strptime(end, "%Y-%m-%d").date()
            else:
                end_date = end
            q.setdefault("timestamp", {})
            q["timestamp"]["$lte"] = datetime.combine(end_date, datetime.max.time())
        except ValueError:
            # If date parsing fails, ignore the filter
            pass
    docs = list(db.meals.find(q).sort("timestamp", 1))
    out = []
    for d in docs:
        out.append(MealLogOut(
            id=str(d["_id"]),
            user_id=str(d["user_id"]),
            meal_type=d["meal_type"],
            timestamp=d["timestamp"],
            items=d.get("items", []),
            notes=d.get("notes"),
            created_at=d["created_at"],
            updated_at=d["updated_at"],
            # Include simple format fields if they exist
            food_name=d.get("food_name"),
            calories=d.get("calories"),
            protein_g=d.get("protein_g"),
            carbs_g=d.get("carbs_g"),
            fats_g=d.get("fats_g"),
        ))
    return out

@router.get("/meals/{meal_id}", response_model=MealLogOut)
def read_meal(meal_id: str, user_id: str = Depends(get_current_user_id)):
    d = db.meals.find_one({"_id": _oid(meal_id), "user_id": _oid(user_id)})
    if not d:
        raise HTTPException(404, "Meal not found")
    return MealLogOut(
        id=str(d["_id"]),
        user_id=str(d["user_id"]),
        meal_type=d["meal_type"],
        timestamp=d["timestamp"],
        items=d.get("items", []),
        notes=d.get("notes"),
        created_at=d["created_at"],
        updated_at=d["updated_at"],
        # Include simple format fields if they exist
        food_name=d.get("food_name"),
        calories=d.get("calories"),
        protein_g=d.get("protein_g"),
        carbs_g=d.get("carbs_g"),
        fats_g=d.get("fats_g"),
    )

@router.put("/meals/{meal_id}", response_model=MealLogOut)
def update_meal(meal_id: str, payload: MealLogIn, user_id: str = Depends(get_current_user_id)):
    now = _now()
    res = db.meals.find_one_and_update(
        {"_id": _oid(meal_id), "user_id": _oid(user_id)},
        {"$set": {"meal_type": payload.meal_type.lower(), "timestamp": payload.timestamp or now, "items": [i.dict() for i in payload.items], "notes": payload.notes, "updated_at": now}},
        return_document=True
    )
    if not res:
        raise HTTPException(404, "Meal not found")
    return MealLogOut(
        id=str(res["_id"]),
        user_id=str(res["user_id"]),
        meal_type=res["meal_type"],
        timestamp=res["timestamp"],
        items=res.get("items", []),
        notes=res.get("notes"),
        created_at=res["created_at"],
        updated_at=res["updated_at"],
    )

@router.delete("/meals/{meal_id}")
def delete_meal(meal_id: str, user_id: str = Depends(get_current_user_id)):
    res = db.meals.delete_one({"_id": _oid(meal_id), "user_id": _oid(user_id)})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"deleted": True}

# ---------- Water logs ----------
@router.post("/water")
def add_water(payload: WaterLogIn, user_id: str = Depends(get_current_user_id)):
    now = _now()
    ts = payload.timestamp or now
    doc = {"user_id": _oid(user_id), "amount_ml": payload.amount_ml, "timestamp": ts, "created_at": now}
    res = db.water_logs.insert_one(doc)
    saved = db.water_logs.find_one({"_id": res.inserted_id})
    
    # Auto-sync water data to progress tracking
    _sync_water_to_progress(user_id)
    
    # Calculate today's total for optimized frontend response
    today_start = datetime.combine(datetime.utcnow().date(), datetime.min.time())
    today_end = today_start + timedelta(days=1)
    pipeline = [
        {"$match": {"user_id": _oid(user_id), "timestamp": {"$gte": today_start, "$lt": today_end}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_ml"}}}
    ]
    agg_res = list(db.water_logs.aggregate(pipeline))
    total_ml = agg_res[0]["total"] if agg_res else payload.amount_ml
    
    # Return both the log entry and today's total
    return {
        "id": str(saved["_id"]), 
        "user_id": str(saved["user_id"]), 
        "amount_ml": saved["amount_ml"], 
        "timestamp": saved["timestamp"], 
        "created_at": saved["created_at"],
        "total_ml": total_ml  # Include today's total to avoid second API call
    }

@router.get("/streak")
def get_streak(user_id: str = Depends(get_current_user_id)):
    """Get user's current streak information"""
    # Update streak when user accesses this endpoint (daily check-in)
    _update_nutrition_streak(user_id)
    
    streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
    if not streak_doc:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_activity_date": None
        }
    return {
        "current_streak": streak_doc.get("current_streak", 0),
        "longest_streak": streak_doc.get("longest_streak", 0),
        "last_activity_date": streak_doc.get("last_activity_date")
    }

@router.post("/activity")
def log_activity(user_id: str = Depends(get_current_user_id)):
    """Log user activity for streak tracking (called when user visits app)"""
    _update_nutrition_streak(user_id)
    
    streak_doc = db.streaks.find_one({"user_id": _oid(user_id)})
    return {
        "success": True,
        "current_streak": streak_doc.get("current_streak", 0) if streak_doc else 0,
        "longest_streak": streak_doc.get("longest_streak", 0) if streak_doc else 0
    }

@router.get("/water/today")
def water_today(user_id: str = Depends(get_current_user_id)):
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())
    docs = list(db.water_logs.find({"user_id": _oid(user_id), "timestamp": {"$gte": start, "$lte": end}}))
    total_ml = sum(d.get("amount_ml", 0) for d in docs)
    profile = _get_nutrition_profile(user_id) or {}
    macros = _get_macro_targets(user_id) or _seed_default_macros(user_id, profile)
    daily_goal = _compute_water_goal(profile, macros)
    return {
        "total_ml": total_ml, 
        "amount_ml": total_ml,  # Backward compatibility for tests
        "logs": [{"id": str(d["_id"]), "amount_ml": d["amount_ml"], "timestamp": d["timestamp"]} for d in docs], 
        "goal_ml": daily_goal
    }

# ---------- Macro Targets ----------
@router.post("/macros", response_model=MacroTargetsOut)
def set_macros(payload: MacroTargetsIn, user_id: str = Depends(get_current_user_id)):
    now = _now()
    doc = {"user_id": _oid(user_id), **payload.dict(), "updated_at": now}
    existing = db.macro_targets.find_one({"user_id": _oid(user_id)})
    if existing:
        db.macro_targets.update_one({"_id": existing["_id"]}, {"$set": doc})
        saved = db.macro_targets.find_one({"_id": existing["_id"]})
    else:
        doc["created_at"] = now
        res = db.macro_targets.insert_one(doc)
        saved = db.macro_targets.find_one({"_id": res.inserted_id})
    return MacroTargetsOut(id=str(saved["_id"]), user_id=str(saved["user_id"]), calories=saved.get("calories"), protein_g=saved.get("protein_g"), carbs_g=saved.get("carbs_g"), fats_g=saved.get("fats_g"), diet_pref=saved.get("diet_pref"), exclude_foods=saved.get("exclude_foods", []), updated_at=saved.get("updated_at"))

@router.get("/macros", response_model=Optional[MacroTargetsOut])
def get_macros(user_id: str = Depends(get_current_user_id)):
    d = db.macro_targets.find_one({"user_id": _oid(user_id)})
    if not d:
        profile = _get_nutrition_profile(user_id) or {}
        d = _seed_default_macros(user_id, profile)
    return MacroTargetsOut(id=str(d["_id"]), user_id=str(d["user_id"]), calories=d.get("calories"), protein_g=d.get("protein_g"), carbs_g=d.get("carbs_g"), fats_g=d.get("fats_g"), diet_pref=d.get("diet_pref"), exclude_foods=d.get("exclude_foods", []), updated_at=d.get("updated_at"))

# ---------- Grocery List generation ----------
@router.get("/grocery-list")
def get_grocery_list(user_id: str = Depends(get_current_user_id)):
    """
    Compile a grocery list from all meal items for the next 7 days
    (simple heuristic: collect unique ingredient names from logged meals).
    """
    # Gather meals for next 7 days or recent logs - here just use last 14 days for simplicity
    start = datetime.utcnow() - timedelta(days=14)
    docs = list(db.meals.find({"user_id": _oid(user_id), "timestamp": {"$gte": start}}))
    items = []
    for d in docs:
        for it in d.get("items", []):
            # best-effort: use item.name and split by commas - could be improved after AI integration
            nm = (it.get("name") or "").strip()
            if nm:
                items.append(nm)
    unique_items = sorted(list(set(items)))
    return {"items": unique_items, "generated_at": datetime.utcnow()}

@router.get("/grocery-list/export")
def export_grocery_csv(user_id: str = Depends(get_current_user_id)):
    data = get_grocery_list(user_id)
    items = data["items"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["item", "checked"])
    for it in items:
        writer.writerow([it, ""])
    csv_bytes = buf.getvalue().encode("utf-8")
    return Response(content=csv_bytes, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=grocery_list.csv"})

# ---------- Meal Swap (rule-based) ----------
def _simple_swap_candidates(item_name: str, exclude_list: List[str], target_profile: Optional[Dict[str, Any]] = None, limit: int = 5, count: Optional[int] = None):
    """
    Simple heuristic: search Nutrition knowledge (we don't have an external food DB).
    Here we will:
      - Search previously logged items in DB with similar names (fuzzy)
      - If not enough, fallback to simpler substitutions (hardcoded mapping)
    """
    # Use count if provided, otherwise use limit
    actual_limit = count if count is not None else limit
    
    # 1) Try user history (most common similar names)
    pipeline = [
        {"$match": {"items.name": {"$regex": item_name, "$options": "i"}}},
        {"$unwind": "$items"},
        {"$match": {"items.name": {"$regex": item_name, "$options": "i"}}},
        {"$group": {"_id": "$items.name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": actual_limit}
    ]
    try:
        rows = list(db.meals.aggregate(pipeline))
        if rows:
            candidates = [r["_id"] for r in rows if r["_id"] not in exclude_list][:actual_limit]
            if candidates:
                return [{"title": c, "calories": 300, "protein_g": 20, "carbs_g": 30, "fats_g": 10} for c in candidates]
    except Exception:
        pass

    # 2) Expanded mapping fallback with diverse options (reduced quinoa usage)
    SUBS = {
        # Main meals
        "beef burger": ["turkey burger", "veggie burger", "chicken breast"],
        "fried rice": ["brown rice", "cauliflower rice", "barley"],
        "pasta": ["zucchini noodles", "whole wheat pasta", "lentil pasta"],
        # Snacks
        "chips": ["apple slices with almond butter", "carrot sticks with hummus", "greek yogurt with berries"],
        "cookies": ["protein bar", "handful of almonds", "banana with peanut butter"],
        "candy": ["dark chocolate square", "fresh berries", "trail mix"],
        "soda": ["herbal tea", "sparkling water with lemon", "kombucha"],
        # Generic fallback patterns
        "chocolate": ["dark chocolate", "fresh fruit", "yogurt parfait"],
        "cake": ["fruit salad", "protein muffin", "rice cakes with avocado"],
        "pizza": ["whole wheat pita pizza", "veggie wrap", "grilled chicken salad"],
        "sandwich": ["lettuce wrap", "open-faced sandwich", "grain bowl"],
    }
    ln = item_name.lower()
    for k, v in SUBS.items():
        if k in ln:
            candidates = [x for x in v if x not in exclude_list][:actual_limit]
            return [{"title": c, "calories": 200 if "snack" in item_name.lower() else 400, "protein_g": 10 if "snack" in item_name.lower() else 25, "carbs_g": 20 if "snack" in item_name.lower() else 40, "fats_g": 8 if "snack" in item_name.lower() else 15} for c in candidates]

    # 3) meal-type specific defaults
    if "snack" in item_name.lower():
        # Snack-specific defaults
        snack_defaults = [
            "apple with almond butter", "greek yogurt with berries", "carrot sticks with hummus",
            "handful of mixed nuts", "protein bar", "banana with peanut butter",
            "celery with cream cheese", "cottage cheese with tomatoes",
            "hard-boiled eggs", "avocado toast on whole grain",
            "trail mix", "fresh berries", "cheese and whole grain crackers",
            "hummus with veggies", "tuna salad on cucumber"
        ]
        defaults = snack_defaults
        # Adjust macros for snacks
        macro_base = {"calories": 180, "protein_g": 8, "carbs_g": 20, "fats_g": 10}
    else:
        # Meal-specific defaults
        meal_defaults = [
            "grilled chicken salad", "quinoa bowl", "stir-fried vegetables with tofu",
            "baked salmon with sweet potato", "turkey stir-fry", "lentil soup",
            "whole grain pasta primavera", "grilled fish tacos", "vegetable stir-fry",
            "chicken and vegetable skewers", "bean chili", "roasted vegetables with quinoa"
        ]
        defaults = meal_defaults
        # Adjust macros for meals
        macro_base = {"calories": 450, "protein_g": 30, "carbs_g": 45, "fats_g": 18}

    # Ensure we always return at least some alternatives
    candidates = [x for x in defaults if x not in exclude_list]
    if not candidates:
        # If all defaults are excluded, return some anyway (fallback)
        candidates = defaults[:actual_limit]

    return [{"title": c, **macro_base} for c in candidates[:actual_limit]]

@router.post("/meal-swap")
async def meal_swap(req: MealSwapRequest = Body(...), user_id: str = Depends(get_current_user_id)):
    logger.info(f"Meal swap request: meal_type={req.meal_type}, current_title={req.current_meal_title}")

    # Handle test format with meal_type and current_meal_title
    if req.meal_type and req.current_meal_title and not req.swap_in_title and not req.swap_in_meal:
        # Try AI-based dynamic alternatives first (return detailed meals)
        detailed_alts: List[Dict[str, Any]] = []
        try:
            if groq_client:
                macros = _sanitize_for_json(_get_macro_targets(user_id) or {})
                target_cal = None
                try:
                    if req.desired_profile and isinstance(req.desired_profile.get("calories"), (int, float)):
                        target_cal = float(req.desired_profile.get("calories"))
                except Exception:
                    target_cal = None
                # Create meal-type specific prompts for better variety
                meal_type_lower = (req.meal_type or "").lower()
                if "snack" in meal_type_lower:
                    base_prompt = "Propose distinct, healthy snack alternatives that are quick to prepare and nutritionally balanced. "
                    base_prompt += "Focus on portion-controlled, satisfying options suitable for snacking. "
                else:
                    base_prompt = "Propose distinct, healthy meal alternatives that are nutritionally balanced for main meals. "
                    base_prompt += "Focus on complete, satisfying meals suitable for breakfast, lunch, or dinner. "

                # Get user profile for cuisine preferences and dietary restrictions
                user_profile = _sanitize_for_json(_get_nutrition_profile(user_id) or {})
                favorite_cuisines = user_profile.get("favorite_cuisines", [])
                allergies = user_profile.get("allergies", [])
                disliked_foods = user_profile.get("disliked_foods", "")
                
                # Build dietary restrictions text
                restrictions_text = ""
                if allergies or disliked_foods:
                    restrictions_parts = []
                    if allergies:
                        restrictions_parts.append(f"ALLERGIES (MUST AVOID): {', '.join(allergies)}")
                    if disliked_foods:
                        restrictions_parts.append(f"DISLIKED FOODS (AVOID): {disliked_foods}")
                    restrictions_text = "\n\nDIETARY RESTRICTIONS:\n" + "\n".join(restrictions_parts)

                system = f"""You are a JSON-only AI assistant for meal alternatives. You MUST output ONLY valid JSON array. No explanations, no markdown, no text before or after.

REQUIRED: Pure JSON array starting with [ and ending with ]

EXACT FORMAT:
[
  {{
    "meal_type": "{req.meal_type}",
    "title": "Alternative Meal Name",
    "calories": 450,
    "protein_g": 25,
    "carbs_g": 45,
    "fats_g": 18,
    "ingredients": ["200g chicken breast", "1 cup brown rice", "1 cup broccoli"],
    "steps": ["Cook rice 15 min", "Grill chicken 8 min per side", "Steam broccoli 5 min"]
  }},
  {{
    "meal_type": "{req.meal_type}",
    "title": "Different Alternative Name",
    "calories": 420,
    "protein_g": 22,
    "carbs_g": 48,
    "fats_g": 16,
    "ingredients": ["200g turkey breast", "1 cup quinoa", "2 cups spinach"],
    "steps": ["Cook quinoa 15 min", "Bake turkey at 200°C for 15 min", "Sauté spinach 3 min"]
  }},
  {{
    "meal_type": "{req.meal_type}",
    "title": "Third Alternative Name",
    "calories": 480,
    "protein_g": 28,
    "carbs_g": 42,
    "fats_g": 20,
    "ingredients": ["200g salmon fillet", "1 cup couscous", "1 cup zucchini"],
    "steps": ["Cook couscous 10 min", "Grill salmon 6 min per side", "Roast zucchini at 200°C for 12 min"]
  }}
]

CRITICAL CALORIE REQUIREMENTS:
- Target calories for this {req.meal_type}: {target_cal if target_cal else "as per current meal"} kcal
- ALL alternatives MUST match this calorie target (±20 kcal tolerance)
- Calculate macros to match exact calorie target
- Protein: 4 cal/g, Carbs: 4 cal/g, Fats: 9 cal/g
- Verify: (protein_g × 4) + (carbs_g × 4) + (fats_g × 9) ≈ calories

CRITICAL RULES:
- ONLY output the JSON array
- NO text before [
- NO text after ]
- NO markdown
- NO explanations
- NO code blocks
- NO "Here are alternatives..." text
- Each meal must be COMPLETELY DIFFERENT from: "{req.current_meal_title}"
- Use different proteins, vegetables, and cooking methods for each alternative
- Ingredients must have quantities (e.g., "200g chicken", "1 cup rice")
- Steps must be concise with times
- Return exactly 3 meal alternatives
- STRICTLY match the calorie target{restrictions_text}"""
                n = min(max(req.alternatives_count or 3, 1), 5)
                payload = {
                    "meal_type": req.meal_type,
                    "current_title": req.current_meal_title,
                    "target_calories": target_cal,
                    "macro_targets": macros,
                    "count": n,
                    "user_cuisines": favorite_cuisines,
                    "allergies": allergies,
                    "disliked_foods": disliked_foods,
                    "random_seed": str(datetime.utcnow().timestamp()),
                    "meal_context": "snack" if "snack" in meal_type_lower else "meal",
                }
                comp = await _call_groq_chat(system, json.dumps(payload), temperature=0.7, max_tokens=900)
                text = comp.choices[0].message.content or ""
                logger.info(f"Swap AI response (length: {len(text)}): {text[:300]}...")

                parsed = _extract_json_from_text(text)

                # If parsing failed, try secondary call
                if not parsed or not isinstance(parsed, list):
                    logger.warning("First swap AI call failed to parse. Trying secondary call...")
                    try:
                        secondary_model = GROQ_MODELS[1] if len(GROQ_MODELS) > 1 else GROQ_MODELS[0]
                        secondary_comp = await _call_groq_chat(system, json.dumps(payload), temperature=0.1, max_tokens=900, model_override=secondary_model)
                        secondary_text = secondary_comp.choices[0].message.content or ""
                        logger.info(f"Secondary swap AI response (length: {len(secondary_text)}): {secondary_text[:300]}...")

                        parsed = _extract_json_from_text(secondary_text)
                        if parsed and isinstance(parsed, list):
                            logger.info("Secondary swap AI call successful")
                    except Exception as e:
                        logger.warning(f"Secondary swap AI call failed: {e}")

                if isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict):
                            detailed_alts.append({
                                "meal_type": item.get("meal_type") or req.meal_type,
                                "title": item.get("title") or f"Alternative {req.meal_type}",
                                "calories": item.get("calories"),
                                "protein_g": item.get("protein_g"),
                                "carbs_g": item.get("carbs_g"),
                                "fats_g": item.get("fats_g"),
                                "ingredients": item.get("ingredients") or [],
                                "steps": item.get("steps") or [],
                            })
        except Exception as e:
            logger.warning(f"Primary AI meal swap generation failed: {e}")
            detailed_alts = []

        if not detailed_alts:
            logger.info("No primary AI alternatives, using enhanced fallback generation")
            # Enhanced fallback: generate detailed meals directly without AI
            profile = _sanitize_for_json(_get_nutrition_profile(user_id) or {})
            meal_type_lower = req.meal_type.lower()
            count = req.alternatives_count or 3

            # Generate varied meal alternatives based on meal type
            if "snack" in meal_type_lower:
                snack_templates = [
                    {
                        "title": "Greek Yogurt Parfait",
                        "calories": target_cal or 180,
                        "protein_g": 12,
                        "carbs_g": 25,
                        "fats_g": 8,
                        "ingredients": ["1 cup Greek yogurt", "1/2 cup mixed berries", "2 tbsp granola", "1 tsp chia seeds"],
                        "steps": ["Layer yogurt and berries in a bowl", "Top with granola and chia seeds", "Serve immediately"]
                    },
                    {
                        "title": "Apple with Almond Butter",
                        "calories": target_cal or 200,
                        "protein_g": 4,
                        "carbs_g": 28,
                        "fats_g": 12,
                        "ingredients": ["1 medium apple", "2 tbsp almond butter", "handful of almonds"],
                        "steps": ["Slice apple into wedges", "Spread almond butter on slices", "Sprinkle with chopped almonds"]
                    },
                    {
                        "title": "Veggie Sticks with Hummus",
                        "calories": target_cal or 150,
                        "protein_g": 6,
                        "carbs_g": 18,
                        "fats_g": 8,
                        "ingredients": ["carrot sticks", "celery sticks", "cucumber slices", "4 tbsp hummus"],
                        "steps": ["Wash and cut vegetables into sticks", "Portion hummus into a small bowl", "Dip vegetables in hummus"]
                    },
                    {
                        "title": "Protein Energy Balls",
                        "calories": target_cal or 220,
                        "protein_g": 8,
                        "carbs_g": 20,
                        "fats_g": 14,
                        "ingredients": ["1/2 cup oats", "1/4 cup peanut butter", "2 tbsp honey", "2 tbsp chia seeds", "1 scoop protein powder"],
                        "steps": ["Mix all ingredients in a bowl", "Roll into small balls", "Refrigerate for 30 minutes before eating"]
                    },
                    {
                        "title": "Cheese and Whole Grain Crackers",
                        "calories": target_cal or 250,
                        "protein_g": 10,
                        "carbs_g": 22,
                        "fats_g": 16,
                        "ingredients": ["2 oz cheddar cheese", "8 whole grain crackers", "cherry tomatoes", "handful of grapes"],
                        "steps": ["Cut cheese into small pieces", "Arrange cheese and tomatoes on crackers", "Serve with grapes on the side"]
                    }
                ]

                # Randomly select and vary the snacks
                import random
                selected_snacks = random.sample(snack_templates, min(count, len(snack_templates)))
                for snack in selected_snacks:
                            detailed_alts.append({
                        "meal_type": req.meal_type,
                        **snack
                    })

                else:
                    # Meal alternatives
                    meal_templates = [
                    {
                        "title": "Grilled Chicken Salad",
                        "calories": target_cal or 450,
                        "protein_g": 35,
                        "carbs_g": 25,
                        "fats_g": 22,
                        "ingredients": ["6 oz grilled chicken breast", "2 cups mixed greens", "1 cup cherry tomatoes", "1/2 cucumber", "2 tbsp olive oil", "1 tbsp balsamic vinegar"],
                        "steps": ["Grill chicken breast for 6-8 minutes per side", "Chop vegetables and mix with greens", "Slice chicken and add to salad", "Drizzle with olive oil and vinegar"]
                    },
                    {
                        "title": "Quinoa Buddha Bowl",
                        "calories": target_cal or 480,
                        "protein_g": 18,
                        "carbs_g": 55,
                        "fats_g": 20,
                        "ingredients": ["1 cup cooked quinoa", "1 cup chickpeas", "1 sweet potato", "2 cups spinach", "1 avocado", "2 tbsp tahini dressing"],
                        "steps": ["Cook quinoa according to package", "Roast sweet potato cubes at 400°F for 25 minutes", "Sauté spinach briefly", "Assemble bowl with all ingredients", "Drizzle with tahini dressing"]
                    },
                    {
                        "title": "Turkey Stir-Fry",
                        "calories": target_cal or 420,
                        "protein_g": 32,
                        "carbs_g": 35,
                        "fats_g": 16,
                        "ingredients": ["6 oz ground turkey", "2 cups broccoli florets", "1 bell pepper", "1 carrot", "2 tbsp soy sauce", "1 tbsp sesame oil", "1 cup brown rice"],
                        "steps": ["Cook brown rice according to package", "Brown turkey in a wok or large pan", "Add chopped vegetables and stir-fry for 5-7 minutes", "Add soy sauce and sesame oil", "Serve over brown rice"]
                    },
                    {
                        "title": "Baked Salmon with Vegetables",
                        "calories": target_cal or 500,
                        "protein_g": 38,
                        "carbs_g": 30,
                        "fats_g": 28,
                        "ingredients": ["6 oz salmon fillet", "2 cups asparagus", "1 cup quinoa", "1 tbsp olive oil", "lemon wedges", "fresh herbs"],
                        "steps": ["Preheat oven to 400°F", "Season salmon and place on baking sheet", "Arrange asparagus around salmon", "Bake for 12-15 minutes", "Serve with cooked quinoa and lemon"]
                    },
                    {
                        "title": "Vegetable Lentil Soup",
                        "calories": target_cal or 380,
                        "protein_g": 22,
                        "carbs_g": 48,
                        "fats_g": 12,
                        "ingredients": ["1 cup lentils", "2 carrots", "2 celery stalks", "1 onion", "2 cups spinach", "4 cups vegetable broth", "2 tbsp olive oil"],
                        "steps": ["Sauté chopped vegetables in olive oil for 5 minutes", "Add lentils and vegetable broth", "Simmer for 25-30 minutes until lentils are tender", "Add spinach and cook for 2 more minutes", "Season with herbs and serve"]
                    }
                ]

                # Randomly select and vary the meals
                import random
                selected_meals = random.sample(meal_templates, min(count, len(meal_templates)))
                for meal in selected_meals:
                    detailed_alts.append({
                        "meal_type": req.meal_type,
                        **meal
                    })

        # De-duplicate by title and trim
        seen = set()
        uniq_detailed: List[Dict[str, Any]] = []
        for m in detailed_alts:
            key = (m.get("title") or "").strip().lower()
            if key and key not in seen:
                seen.add(key)
                uniq_detailed.append(m)
            if len(uniq_detailed) >= (req.alternatives_count or 3):
                break

        logger.info(f"Meal swap generated {len(uniq_detailed)} alternatives for {req.meal_type}")
        if uniq_detailed:
            logger.debug(f"First alternative: {uniq_detailed[0].get('title')}")

        return {"alternatives": uniq_detailed}
    
    # Handle swap execution with swap_in_title (replace a single entry in today's plan)
    if (req.swap_in_title or req.swap_in_meal) and req.meal_type:
        today = _today_date_str()
        doc = db.nutrition_daily_plans.find_one({
            "user_id": _oid(user_id),
            "date": today,
        }) or {}

        meal_type_norm = (req.meal_type or "").strip().lower()
        is_snack = bool(req.is_snack) if req.is_snack is not None else ("snack" in meal_type_norm)
        key = "snacks" if is_snack else "plan"
        entries = list(doc.get(key, []))

        # Find target index: prefer slot_index (highest priority), then exact title match, then meal_type match
        target_idx = -1
        
        # Priority 1: Use provided slot_index (highest priority - most accurate)
        if isinstance(req.slot_index, int) and 0 <= req.slot_index < len(entries):
            target_idx = req.slot_index
        
        # Priority 2: Match exact title (only if slot_index not provided)
        if target_idx < 0 and req.current_meal_title:
            for i, e in enumerate(entries):
                try:
                    if (e.get("title") or "").strip().lower() == req.current_meal_title.strip().lower():
                        target_idx = i
                        break
                except Exception:
                    continue
        
        # Priority 3: Match meal_type (only if slot_index and title not found)
        if target_idx < 0 and meal_type_norm:
            for i, e in enumerate(entries):
                try:
                    if (e.get("meal_type") or "").strip().lower() == meal_type_norm:
                        target_idx = i
                        break
                except Exception:
                    continue
        
        # Priority 4: Default to first entry
        if target_idx < 0:
            target_idx = 0 if entries else -1

        # If no entries exist, create a default one slot
        if target_idx < 0:
            entries = [{
                "meal_type": req.meal_type,
                "title": req.swap_in_title or (req.swap_in_meal or {}).get("title") or "Meal",
            }]
            target_idx = 0
        else:
            prev = entries[target_idx] if target_idx < len(entries) else {}
            if req.swap_in_meal and isinstance(req.swap_in_meal, dict):
                # Use provided detailed meal (normalize)
                meal = req.swap_in_meal
                entries[target_idx] = {
                    "meal_type": meal.get("meal_type") or prev.get("meal_type") or req.meal_type,
                    "title": meal.get("title") or prev.get("title") or "Meal",
                    "calories": meal.get("calories"),
                    "protein_g": meal.get("protein_g"),
                    "carbs_g": meal.get("carbs_g"),
                    "fats_g": meal.get("fats_g"),
                    "ingredients": meal.get("ingredients") or [],
                    "steps": meal.get("steps") or [],
                }
            else:
                # Generate detailed meal by title
                plan_macros = doc.get("plan_macros") or _aggregate_plan_macros(doc.get("plan", []), doc.get("snacks", []))
                per_meal_macros = {
                    "calories": prev.get("calories") or (plan_macros.get("calories") / max(1, len(doc.get("plan", [])) + len(doc.get("snacks", [])))) if plan_macros else None,
                    "protein_g": prev.get("protein_g") or None,
                    "carbs_g": prev.get("carbs_g") or None,
                    "fats_g": prev.get("fats_g") or None,
                }
                profile = _get_nutrition_profile(user_id) or {}
                detailed = await _generate_detailed_meal(prev.get("meal_type") or req.meal_type, req.swap_in_title or (req.swap_in_meal or {}).get("title") or "Meal", per_meal_macros, profile)
                entries[target_idx] = detailed

        # Recompute plan macros and grocery list
        new_plan = entries if key == "plan" else doc.get("plan", [])
        new_snacks = entries if key == "snacks" else doc.get("snacks", [])
        new_plan_macros = _aggregate_plan_macros(new_plan, new_snacks)
        new_grocery = _grocery_list_from_plan(new_plan, new_snacks)

        update_doc = {
            "$set": {
                key: entries,
                "plan_macros": new_plan_macros,
                "grocery_list": new_grocery,
                "updated_at": _now(),
            }
        }
        db.nutrition_daily_plans.update_one({
            "user_id": _oid(user_id),
            "date": today,
        }, update_doc, upsert=True)

        saved = db.nutrition_daily_plans.find_one({"user_id": _oid(user_id), "date": today}) or {}
        return {
            "message": "Meal swapped successfully",
            "plan": _serialize_plan_entries(saved.get("plan", [])),
            "snacks": _serialize_plan_entries(saved.get("snacks", [])),
            "plan_macros": saved.get("plan_macros"),
            "grocery_list": saved.get("grocery_list", []),
            "saved": saved.get("saved", False),  # Include saved status
            "water_goal_ml": saved.get("water_goal_ml"),  # Include water goal
        }
    
    # If meal_id provided, return swaps for each item in meal
    if req.meal_id:
        meal = db.meals.find_one({"_id": _oid(req.meal_id), "user_id": _oid(user_id)})
        if not meal:
            raise HTTPException(404, "Meal not found")
        swaps = {}
        for it in meal.get("items", []):
            name = it.get("name", "")
            swaps[name] = _simple_swap_candidates(name, exclude_list=meal.get("items", []), target_profile=req.desired_profile)
        return {"swaps": swaps}
    # else: generic suggestions
    # use desired_profile to influence result in the future; for now return defaults
    suggestions = _simple_swap_candidates("generic", exclude_list=[], target_profile=req.desired_profile)
    return {"swaps": {"generic": suggestions}}

# ---------- AI: Recipe generation using Groq (LLM) ----------
def _llm_generate_recipe_prompt(payload: GenerateRecipeRequest, user_doc: dict):
    parts = []
    if payload.title_hint:
        parts.append(f"Title hint: {payload.title_hint}")
    if payload.target_calories:
        parts.append(f"Target calories: {payload.target_calories}")
    if payload.protein_g:
        parts.append(f"Protein (g): {payload.protein_g}")
    if payload.carbs_g:
        parts.append(f"Carbs (g): {payload.carbs_g}")
    if payload.fats_g:
        parts.append(f"Fats (g): {payload.fats_g}")
    if payload.diet_pref:
        parts.append(f"Diet preference: {payload.diet_pref}")
    parts.append(f"User diet preferences: {user_doc.get('diet_pref') or user_doc.get('diet_preferences') or 'none'}")
    parts.append("Return STRICT JSON only with keys: title, ingredients (list), steps (list), calories, protein_g, carbs_g, fats_g.")
    return "\n".join(parts)

async def _call_groq_chat(system: str, user: str, temperature: float = 0.2, max_tokens: int = 700, model_override: Optional[str] = None):
    """
    Robust AI call with model fallback mechanism.
    Tries multiple models if the primary model fails.
    """
    if not groq_client:
        raise AgentNodeError("AI service not configured (GROQ).")

    # Determine which models to try
    models_to_try = []
    if model_override:
        models_to_try = [model_override]
    else:
        models_to_try = GROQ_MODELS.copy()

    last_error = None

    for model in models_to_try:
        params = {
            "model": model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            logger.debug(f"Trying model: {model}")
            response = groq_client.chat.completions.create(**params)
            logger.debug(f"Successfully used model: {model}")
            return response
        except Exception as e:
            logger.warning(f"Model {model} failed: {str(e)}")
            last_error = e
            continue

    # If all models failed, raise the last error
    logger.error(f"All models failed. Last error: {last_error}")
    raise AgentNodeError(f"AI call failed after trying all models: {last_error}")

@router.post("/generate-recipe", response_model=GeneratedRecipe)
async def generate_recipe(payload: GenerateRecipeRequest, user_id: str = Depends(get_current_user_id)):
    user = db.users.find_one({"_id": _oid(user_id)}) or {}
    system = (
        "You are a professional nutritionist and recipe writer. Produce healthy, practical recipes. "
        "Always return STRICT JSON with quantified ingredients and actionable steps for beginners."
    )
    prompt = _llm_generate_recipe_prompt(payload, user) + "\n" + (
        "Requirements:\n"
        "- Ingredients must include explicit quantity and unit (e.g., '200 g chicken breast', '1 tbsp olive oil', '1 tsp cumin').\n"
        "- Steps must include specific times/temperatures where relevant (e.g., 'Bake at 200°C for 15 minutes').\n"
        "- Keep the recipe simple and achievable for a novice cook.\n"
        "- Ensure macro totals roughly align with targets if provided."
    )
    comp = await _call_groq_chat(system, prompt, temperature=0.25, max_tokens=1500)
    text = comp.choices[0].message.content or ""

    # Use robust JSON extraction
    parsed = _extract_json_from_text(text)
    if not parsed:
        raise HTTPException(500, "AI did not return valid JSON recipe. Inspect raw output for debugging.")
    # Normalize
    title = parsed.get("title", parsed.get("name", "Generated Recipe"))
    ingredients = parsed.get("ingredients", parsed.get("ingredient_list", []))
    steps = parsed.get("steps", parsed.get("instructions", []))
    return GeneratedRecipe(title=title, ingredients=ingredients, steps=steps, calories=parsed.get("calories"), protein_g=parsed.get("protein_g"), carbs_g=parsed.get("carbs_g"), fats_g=parsed.get("fats_g"))

# ---------- Compliance prediction (simple rule-based) ----------
def predict_daily_compliance(user_id: str, day: date = None) -> Dict[str, Any]:
    """
    Rule-based predictor:
      - If user logged >= 2 meals and total calories within +/-20% of target -> high
      - if <=1 meal logged -> low
      - if excluded foods present -> reduce score
    """
    d = day or datetime.utcnow().date()
    start = datetime.combine(d, datetime.min.time())
    end = datetime.combine(d, datetime.max.time())
    meals = list(db.meals.find({"user_id": _oid(user_id), "timestamp": {"$gte": start, "$lte": end}}))
    macros = db.macro_targets.find_one({"user_id": _oid(user_id)}) or {}
    total_cal = 0
    for m in meals:
        # Handle both complex format (items array) and simple format (direct fields)
        if "items" in m and m["items"]:
            for it in m.get("items", []):
                total_cal += (it.get("calories") or 0)
        else:
            # Simple format - direct fields on the meal
            total_cal += (m.get("calories") or 0)
    target = macros.get("calories")
    status = "unknown"
    score = 0.5
    if not meals:
        status = "no_logs"
        score = 0.05
    else:
        if target:
            if abs(total_cal - target) <= 0.2 * (target or 1):
                status = "on_track"
                score = 0.9
            elif total_cal < 0.5 * (target or 1):
                status = "under"
                score = 0.3
            else:
                status = "over"
                score = 0.5
        else:
            status = "partial"
            score = 0.6
    return {"status": status, "score": score, "meals_count": len(meals), "total_calories": total_cal, "target_calories": target}

@router.get("/compliance/today")
def compliance_today(user_id: str = Depends(get_current_user_id)):
    return predict_daily_compliance(user_id)

# ---------- Diet optimization agent (LangGraph implementation) ----------
class AgentNodeError(HTTPException):
    def __init__(self, message: str):
        super().__init__(status_code=500, detail=message)


def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """
    Ultra-robust JSON extraction from AI responses. This function tries multiple strategies
    to extract valid JSON from various AI response formats.
    """
    if not text or not text.strip():
        logger.warning("Empty or whitespace-only response received")
        return None

    text = text.strip()
    
    # Pre-process: Remove common AI corruption patterns
    # Some models insert random text like "PageSize", "Page Content", etc.
    corruption_patterns = [
        r'\s*PageSize\s*',
        r'\s*Page\s+Content\s*',
        r'\s*Page\s+content\s*',
        r'\s*era\s+Page\s*',
        r'\s*פר\s*',  # Hebrew characters that sometimes appear
        r'\s*coordin\s*',
        r'\s+Page\s+',
    ]
    
    import re
    for pattern in corruption_patterns:
        text = re.sub(pattern, ' ', text)
    
    # Clean up multiple spaces
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    logger.info(f"Attempting to parse JSON from response (length: {len(text)})")
    logger.debug(f"Full response: {text}")

    # Strategy 1: Direct JSON parsing (most common case)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, (dict, list)):
            logger.info("Successfully parsed JSON directly")
            return parsed
    except json.JSONDecodeError as e:
        logger.debug(f"Direct JSON parsing failed: {e}")

    # Strategy 2: Extract JSON from markdown code blocks
    import re

    code_block_patterns = [
        r'```(?:json)?\s*(\{[\s\S]*?\})\s*```',  # Standard markdown
        r'```\s*(\{[\s\S]*?\})\s*```',           # Generic code block
        r'`(\{[\s\S]*?\})`',                     # Inline code
        r'```json\s*(\{[\s\S]*?\})',            # JSON-specific markdown
        r'```\s*(\{[\s\S]*?\})',                 # Any code block with JSON
    ]

    for pattern in code_block_patterns:
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
    for match in matches:
        try:
            parsed = json.loads(match.strip())
            if isinstance(parsed, (dict, list)):
                logger.info("Successfully parsed JSON from code block")
                return parsed
        except json.JSONDecodeError as e:
                logger.debug(f"Code block parsing failed: {e}")

    # Strategy 3: Find JSON objects using balanced brace/bracket counting
    def find_json_objects(text: str):
        """Find complete JSON objects/arrays by counting braces and brackets"""
        objects = []
        brace_count = 0
        bracket_count = 0
        start_pos = -1
        start_char = None

        i = 0
        while i < len(text):
            char = text[i]
            if char == '{':
                if brace_count == 0 and bracket_count == 0:
                    start_pos = i
                    start_char = '{'
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0 and bracket_count == 0 and start_pos != -1 and start_char == '{':
                    json_candidate = text[start_pos:i+1]
                    objects.append(json_candidate)
                    start_pos = -1
                    start_char = None
            elif char == '[':
                if brace_count == 0 and bracket_count == 0:
                    start_pos = i
                    start_char = '['
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if brace_count == 0 and bracket_count == 0 and start_pos != -1 and start_char == '[':
                    json_candidate = text[start_pos:i+1]
                    objects.append(json_candidate)
                    start_pos = -1
                    start_char = None
            i += 1

        return objects

    json_objects = find_json_objects(text)
    for obj in json_objects:
        try:
            parsed = json.loads(obj)
            if isinstance(parsed, (dict, list)):
                logger.info(f"Successfully parsed JSON using brace/bracket counting: {type(parsed)}")
                return parsed
        except json.JSONDecodeError as e:
            logger.debug(f"Brace counting parsing failed: {e}")

    # Strategy 4: Clean and retry - remove common prefixes/suffixes
    cleaned_text = text

    prefixes_to_remove = [
        "Here is your meal plan:",
        "Here's the meal plan:",
        "Meal plan:",
        "Response:",
        "JSON:",
        "Output:",
        "Here's your response:",
        "Here is your response:",
        "The meal plan is:",
        "Meal plan response:",
        "Here's a meal plan for you:",
        "Based on your preferences:",
        "I've created a meal plan:",
        "Your meal plan:",
        "Meal Plan:",
        "Here's the meal plan I created:",
    ]

    for prefix in prefixes_to_remove:
        if cleaned_text.upper().startswith(prefix.upper()):
            cleaned_text = cleaned_text[len(prefix):].strip()

    # Also clean up any trailing text after the JSON
    if '}' in cleaned_text:
        last_brace = cleaned_text.rfind('}')
        if last_brace > 0 and last_brace < len(cleaned_text) - 1:
            # Check if there's text after the last closing brace
            after_brace = cleaned_text[last_brace + 1:].strip()
            if after_brace and not after_brace.startswith(','):
                cleaned_text = cleaned_text[:last_brace + 1]

    try:
        parsed = json.loads(cleaned_text)
        if isinstance(parsed, (dict, list)):
            logger.info("Successfully parsed JSON after cleaning")
            return parsed
    except json.JSONDecodeError as e:
        logger.debug(f"Cleaned text parsing failed: {e}")

    # Strategy 5: Extract JSON between first { and last }
    start_idx = text.find('{')
    end_idx = text.rfind('}')

    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        json_candidate = text[start_idx:end_idx+1]
        logger.debug(f"Extracted JSON candidate: {json_candidate[:200]}...")
        try:
            parsed = json.loads(json_candidate)
            if isinstance(parsed, (dict, list)):
                logger.info("Successfully parsed JSON by finding braces")
                return parsed
        except json.JSONDecodeError as e:
            logger.debug(f"Brace extraction parsing failed: {e}")

    # Strategy 6: Fix common JSON issues
    def fix_common_json_issues(text: str) -> str:
        """Fix common JSON formatting issues"""
        # Remove trailing commas before closing braces/brackets
        text = re.sub(r',(\s*[}\]])', r'\1', text)
        # Fix some common quote issues (be very careful)
        return text

    fixed_text = fix_common_json_issues(text)
    if fixed_text != text:
        try:
            parsed = json.loads(fixed_text)
            if isinstance(parsed, (dict, list)):
                logger.info("Successfully parsed JSON after fixing common issues")
                return parsed
        except json.JSONDecodeError:
            pass

    # Strategy 7: Extract JSON from common AI response patterns
    response_patterns = [
        r'(?:here\'s|here is)(?:\s+(?:your\s+)?(?:response|answer|meal plan)?:?\s*)?(\{.*\})',
        r'(?:response|answer|output|result)?:?\s*(\{.*\})',
        r'(\{[^{}]*\{[^{}]*\}[^{}]*\})',
        r'\{[^{}]*"daily_plan"[^{}]*\}',
        r'\{[^{}]*"snack_plan"[^{}]*\}',
    ]

    for pattern in response_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE | re.DOTALL)
        for match in matches:
            try:
                cleaned = match.strip()
                if cleaned.startswith('{') and cleaned.endswith('}'):
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, dict) and ('daily_plan' in parsed or 'snack_plan' in parsed):
                        logger.info("Successfully parsed JSON using response pattern extraction")
                        return parsed
            except json.JSONDecodeError:
                continue

    # Strategy 8: Try to fix incomplete JSON by adding missing closing braces
    if text.count('{') > text.count('}'):
        try:
            fixed_text = text.rstrip() + '}' * (text.count('{') - text.count('}'))
            parsed = json.loads(fixed_text)
            if isinstance(parsed, dict):
                logger.info("Successfully parsed JSON by adding missing closing braces")
                return parsed
        except json.JSONDecodeError:
            pass

    # Strategy 9: Extract the longest valid JSON substring
    def find_longest_json(text: str):
        """Find the longest contiguous JSON substring"""
        max_length = 0
        best_json = None

        start_indices = [i for i, char in enumerate(text) if char == '{']

        for start_idx in start_indices:
            brace_count = 0
            for end_idx in range(start_idx, len(text)):
                if text[end_idx] == '{':
                    brace_count += 1
                elif text[end_idx] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        candidate = text[start_idx:end_idx + 1]
                        if len(candidate) > max_length:
                            try:
                                parsed = json.loads(candidate)
                                if isinstance(parsed, dict):
                                    max_length = len(candidate)
                                    best_json = parsed
                            except json.JSONDecodeError:
                                continue
                        break

        return best_json

    longest_json = find_longest_json(text)
    if longest_json and ('daily_plan' in longest_json or 'snack_plan' in longest_json):
        logger.info("Successfully parsed JSON using longest substring extraction")
        return longest_json

    # Strategy 10: Final attempt - try to manually construct valid JSON
    try:
        if '{' in text and ('daily_plan' in text or 'snack_plan' in text):
            start_idx = text.find('{')
            if start_idx != -1:
                # Try to find where it might end by looking for common ending patterns
                remaining_text = text[start_idx:]

                potential_endings = [
                    r'\}\s*$',
                    r'\}\s*,?\s*$',
                ]

                for pattern in potential_endings:
                    match = re.search(pattern, remaining_text)
                    if match:
                        candidate = remaining_text[:match.end()]
                        try:
                            parsed = json.loads(candidate)
                            if isinstance(parsed, dict) and ('daily_plan' in parsed or 'snack_plan' in parsed):
                                logger.info("Successfully parsed JSON using manual reconstruction")
                                return parsed
                        except json.JSONDecodeError:
                            continue
    except Exception as e:
        logger.debug(f"Manual reconstruction attempt failed: {e}")

    logger.error(f"ALL JSON parsing strategies failed for response: {text[:300]}...")
    logger.error(f"Response analysis: length={len(text)}, braces={{count}}: {text.count('{')}, }}count: {text.count('}')}")

    # If we get here, all parsing attempts have failed
    return None

async def _generate_plan_with_llm(state: DietAgentState, regenerate_snacks: bool = False) -> Dict[str, Any]:
    profile = state.get("profile") or {}
    macros = state.get("macro_targets") or {}
    meal_logs = state.get("meal_logs", [])
 
    # If AI service is not available, use fallback immediately
    if not groq_client:
        logger.warning("AI service not configured (GROQ), using fallback meal plan")
        fallback = _build_fallback_plan(profile, macros)
        return {
            "daily_plan": fallback["daily_plan"],
            "snack_plan": fallback["snack_plan"],
            "raw": {"source": "fallback", "reason": "ai_not_configured"},
        }

    history = {
        "total_meals": len(meal_logs),
        "recent_feedback": [m.get("notes") for m in meal_logs if m.get("notes")],
    }
 
    # Calculate per-meal calorie distribution
    total_calories = macros.get("calories", 2000)
    meals_count = profile.get("meals_per_day", 3)
    snacks_count = profile.get("snacks_per_day", 2)
    
    # Distribute calories: 70% for meals, 30% for snacks
    meal_calories_total = int(total_calories * 0.70)
    snack_calories_total = int(total_calories * 0.30)
    
    # Calculate per-item calories
    cal_per_meal = meal_calories_total // meals_count if meals_count > 0 else 500
    cal_per_snack = snack_calories_total // snacks_count if snacks_count > 0 else 200
    
    # Distribution: Breakfast 25%, Lunch 40%, Dinner 35%
    breakfast_cal = int(meal_calories_total * 0.25)
    lunch_cal = int(meal_calories_total * 0.40)
    dinner_cal = int(meal_calories_total * 0.35)
    
    system_prompt = f"""You are a JSON-only AI assistant. You MUST output ONLY valid JSON. No explanations, no markdown, no text before or after.

REQUIRED: Pure JSON object starting with {{ and ending with }}

EXACT FORMAT:
{{
  "daily_plan": [
    {{
      "meal_type": "breakfast",
      "title": "Breakfast Name",
      "calories": {breakfast_cal},
      "protein_g": 20,
      "carbs_g": 40,
      "fats_g": 16,
      "ingredients": ["200g chicken breast", "1 cup rice", "1 cup vegetables"],
      "steps": ["Cook rice 15 min", "Grill chicken 8 min per side", "Steam vegetables 5 min"]
    }},
    {{
      "meal_type": "lunch",
      "title": "Lunch Name",
      "calories": {lunch_cal},
      "protein_g": 30,
      "carbs_g": 45,
      "fats_g": 20,
      "ingredients": ["250g fish fillet", "1 cup quinoa", "2 cups salad greens"],
      "steps": ["Cook quinoa 15 min", "Bake fish at 200°C for 12 min", "Prepare salad"]
    }},
    {{
      "meal_type": "dinner",
      "title": "Dinner Name",
      "calories": {dinner_cal},
      "protein_g": 35,
      "carbs_g": 50,
      "fats_g": 22,
      "ingredients": ["200g beef steak", "2 medium potatoes", "200g broccoli"],
      "steps": ["Bake potatoes at 200°C for 45 min", "Grill steak 4 min per side", "Steam broccoli 8 min"]
    }}
  ],
  "snack_plan": [
    {{
      "meal_type": "snack",
      "title": "Snack Name",
      "calories": {cal_per_snack},
      "protein_g": 10,
      "carbs_g": 25,
      "fats_g": 8,
      "ingredients": ["1 cup yogurt", "1/2 cup fruit", "2 tbsp nuts"],
      "steps": ["Mix yogurt with fruit", "Top with nuts"]
    }}
  ],
  "water_goal_ml": 2500,
  "grocery_list": ["chicken", "rice", "vegetables", "fish", "quinoa", "salad greens", "beef", "potatoes", "broccoli", "yogurt", "fruit", "nuts"]
}}

CRITICAL CALORIE REQUIREMENTS:
- TOTAL DAILY CALORIES MUST BE: {total_calories} kcal (±50 kcal tolerance)
- Breakfast MUST be: {breakfast_cal} kcal (±30 kcal)
- Lunch MUST be: {lunch_cal} kcal (±30 kcal)  
- Dinner MUST be: {dinner_cal} kcal (±30 kcal)
- Each snack MUST be: {cal_per_snack} kcal (±20 kcal)
- Calculate macros to match these exact calorie targets
- Protein: 4 cal/g, Carbs: 4 cal/g, Fats: 9 cal/g
- Verify: (protein_g × 4) + (carbs_g × 4) + (fats_g × 9) = calories for each meal

CRITICAL RULES:
- ONLY output the JSON object
- NO text before {{
- NO text after }}
- NO markdown
- NO explanations
- NO code blocks
- NO "Here is..." or "Response:" text
- Ingredients must have quantities (e.g., "200g chicken", "1 cup rice")
- Steps must be concise with times
- STRICTLY follow the calorie distribution above"""

    # Build comprehensive user payload
    user_payload = {
        "user_profile": {
            "diet_type": profile.get("diet_type", "balanced"),
            "meals_per_day": profile.get("meals_per_day", 3),
            "snacks_per_day": profile.get("snacks_per_day", 2),
            "allergies": profile.get("allergies", []),
            "disliked_foods": profile.get("disliked_foods", ""),
            "favorite_cuisines": profile.get("favorite_cuisines", []),
            "age": profile.get("age"),
            "gender": profile.get("gender"),
            "activity_level": profile.get("activity_level", "moderate"),
        },
        "nutrition_goals": {
            "total_calories": total_calories,
            "breakfast_calories": breakfast_cal,
            "lunch_calories": lunch_cal,
            "dinner_calories": dinner_cal,
            "snack_calories": cal_per_snack,
            "protein_g": macros.get("protein_g", 150),
            "carbs_g": macros.get("carbs_g", 250),
            "fats_g": macros.get("fats_g", 67),
            "fiber_g": macros.get("fiber_g", 25),
        },
        "meal_history": {
            "total_meals_logged": len(meal_logs),
            "recent_feedback": [m.get("notes") for m in meal_logs[-5:] if m.get("notes")],
        },
        "requirements": {
            "include_water_goal": True,
            "include_grocery_list": True,
            "detailed_recipes": True,
            "nutritional_breakdown": True,
            "strict_calorie_matching": True,
        }
    }
 
    logger.debug("Diet agent request", extra={"user_payload": user_payload})

    # Try AI generation with fallback
    try:
        comp = await _call_groq_chat(system_prompt, json.dumps(user_payload), temperature=0.35, max_tokens=2000)

        # Use the robust JSON extraction function
        raw_content = comp.choices[0].message.content or ""
        logger.info(f"Raw AI response (length: {len(raw_content)}): {raw_content[:500]}...")
        logger.debug("Full raw AI response", extra={"full_response": raw_content})

        payload = _extract_json_from_text(raw_content)

        # If parsing failed, try a second AI call with different parameters
        if not payload:
            logger.warning(f"First AI call failed to parse. Trying secondary call with different model...")
            try:
                # Try with a different model and lower temperature for more structured output
                secondary_model = GROQ_MODELS[1] if len(GROQ_MODELS) > 1 else GROQ_MODELS[0]
                secondary_comp = await _call_groq_chat(system_prompt, json.dumps(user_payload), temperature=0.1, max_tokens=2000, model_override=secondary_model)
                secondary_content = secondary_comp.choices[0].message.content or ""
                logger.info(f"Secondary AI response (length: {len(secondary_content)}): {secondary_content[:300]}...")

                payload = _extract_json_from_text(secondary_content)
                if payload:
                    logger.info("Secondary AI call successfully generated meal plan")
            except Exception as e:
                logger.warning(f"Secondary AI call also failed: {e}")

        if payload:
            logger.info("AI successfully generated personalized meal plan")
            logger.debug("AI payload keys", extra={"keys": list(payload.keys()) if isinstance(payload, dict) else "not_dict"})

            # Ensure the response has the expected structure
            daily_plan = payload.get("daily_plan", [])
            snack_plan = payload.get("snack_plan", [])
            water_goal_ml = payload.get("water_goal_ml", 2000)  # Default 2L
            grocery_list = payload.get("grocery_list", [])

            # Validate that we have actual meal data
            if not daily_plan and not snack_plan:
                logger.warning("AI returned empty meal plan, falling back to deterministic plan")
                logger.debug("Empty AI response payload", extra={"payload": payload})
                fallback = _build_fallback_plan(profile, macros)
                return {
                    "daily_plan": fallback["daily_plan"],
                    "snack_plan": fallback["snack_plan"],
                    "water_goal_ml": water_goal_ml,
                    "grocery_list": grocery_list,
                    "raw": {"source": "fallback", "reason": "empty_ai_response"},
                }

            # Validate meal structure
            valid_meals = []
            for meal in daily_plan:
                if isinstance(meal, dict) and meal.get("title") and meal.get("meal_type"):
                    valid_meals.append(meal)
                else:
                    logger.warning(f"Invalid meal structure: {meal}")

            valid_snacks = []
            for snack in snack_plan:
                if isinstance(snack, dict) and snack.get("title") and snack.get("meal_type"):
                    valid_snacks.append(snack)
                else:
                    logger.warning(f"Invalid snack structure: {snack}")

            if not valid_meals and not valid_snacks:
                logger.warning("No valid meals or snacks found in AI response, using fallback")
                fallback = _build_fallback_plan(profile, macros)
                return {
                    "daily_plan": fallback["daily_plan"],
                    "snack_plan": fallback["snack_plan"],
                    "water_goal_ml": water_goal_ml,
                    "grocery_list": grocery_list,
                    "raw": {"source": "fallback", "reason": "invalid_meal_structure"},
                }

            logger.info(f"AI generated {len(valid_meals)} meals and {len(valid_snacks)} snacks")
            return {
                "daily_plan": valid_meals,
                "snack_plan": valid_snacks,
                "water_goal_ml": water_goal_ml,
                "grocery_list": grocery_list,
                "raw": payload,
            }
        else:
            logger.warning("AI returned unparseable response, falling back to deterministic plan")
            logger.debug("Unparseable response", extra={"response": raw_content[:500]})
            fallback = _build_fallback_plan(profile, macros)
            return {
                "daily_plan": fallback["daily_plan"],
                "snack_plan": fallback["snack_plan"],
                "water_goal_ml": 2000,  # Default 2L
                "grocery_list": [],
                "raw": {"source": "fallback", "reason": "unparseable_ai_response"},
            }
 
    except Exception as exc:
        logger.warning("Diet agent failed, falling back to deterministic plan", exc_info=exc)
        fallback = _build_fallback_plan(profile, macros)
        return {
            "daily_plan": fallback["daily_plan"],
            "snack_plan": fallback["snack_plan"],
            "water_goal_ml": 2000,  # Default 2L
            "grocery_list": [],
            "raw": {"source": "fallback", "reason": "ai_error", "error": str(exc)},
        }


async def _generate_swap_suggestions(state: DietAgentState) -> List[str]:
    if not state.get("swap_context"):
        return []
    context = state["swap_context"]
    try:
        logger.debug("Diet agent swap context", extra={"swap_context": context})
        comp = await _call_groq_chat(
            (
                "You assist with meal swaps while preserving nutritional balance. "
                "Always return STRICT JSON only. Return either a JSON array of suggestion strings, "
                "or an object {\"suggestions\": [ ... ]}."
            ),
            json.dumps({
                "macro_targets": state.get("macro_targets") or {},
                "swap_context": context,
                "instruction": "Provide 3-5 concise alternative meal titles that match or improve macros."
            }),
            temperature=0.25,
            max_tokens=600,
        )
        text = comp.choices[0].message.content or ""

        # Use robust JSON extraction
        payload = _extract_json_from_text(text)

        if not payload:
            # Fall back to deterministic suggestions to avoid empty UI
            logger.warning("Swap suggestions JSON missing; falling back to rule-based candidates")
            title = (context.get("current_meal_title") or context.get("title") or "generic").strip() or "generic"
            fallback = [c.get("title") for c in _simple_swap_candidates(title, exclude_list=[], target_profile=context.get("desired_profile"), limit=5)]
            return fallback[:5]

        loaded = payload
        ideas = loaded if isinstance(loaded, list) else loaded.get("suggestions", [])
        # If structure is not as expected, try to coerce
        if not ideas and isinstance(loaded, dict):
            # Look for common keys used by models
            for k in ["alternatives", "options", "ideas"]:
                if isinstance(loaded.get(k), list):
                    ideas = loaded[k]
                    break
        # Final fallback if still empty
        if not ideas:
            title = (context.get("current_meal_title") or context.get("title") or "generic").strip() or "generic"
            ideas = [c.get("title") for c in _simple_swap_candidates(title, exclude_list=[], target_profile=context.get("desired_profile"), limit=5)]
        return [str(s) for s in ideas][:5]
    except Exception as exc:  # noqa: BLE001
        logger.exception("Diet agent swap suggestion failed")
        raise AgentNodeError(f"Failed to generate swap suggestions: {exc}")


# LangGraph nodes
async def _node_load_context(state: DietAgentState) -> DietAgentState:
    user_id = state.get("user_id")
    if not user_id:
        raise AgentNodeError("Missing user_id in state")
    state = state.copy()
    raw_profile = _get_nutrition_profile(user_id) or {}
    raw_macros = _get_macro_targets(user_id) or {}
    # sanitize (remove _id, convert ObjectId/datetime)
    def _sanitize(obj: Any):
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                if k == "_id":
                    continue
                out[k] = _sanitize(v)
            return out
        if isinstance(obj, list):
            return [_sanitize(v) for v in obj]
        if isinstance(obj, _BsonObjectId):
            return str(obj)
        if hasattr(obj, "isoformat"):
            try:
                return obj.isoformat()
            except Exception:
                return str(obj)
        return obj

    state["profile"] = _sanitize(raw_profile)
    state["macro_targets"] = _sanitize(raw_macros)
    if not state["macro_targets"]:
        state["macro_targets"] = _seed_default_macros(user_id, state["profile"])
    state["meal_logs"] = list(db.meals.find({"user_id": _oid(user_id), "timestamp": {"$gte": datetime.utcnow() - timedelta(days=10)}}).sort("timestamp", 1))
    state["compliance_summary"] = predict_daily_compliance(user_id)
    state["water_goal_ml"] = _compute_water_goal(state["profile"], state["macro_targets"])
    debug = state.get("debug", [])
    debug.append("context_loaded")
    state["debug"] = debug
    return state


async def _node_generate_plan(state: DietAgentState) -> DietAgentState:
    state = state.copy()
    result = await _generate_plan_with_llm(state)
    profile = state.get("profile") or {}
    macros = state.get("macro_targets") or {}
    fallback = _build_fallback_plan(profile, macros)
    meals_target = int(profile.get("meals_per_day") or len(fallback["daily_plan"]) or 3)
    snacks_target = int(profile.get("snacks_per_day") or len(fallback["snack_plan"]) or 0)
    meals_target = max(1, min(8, meals_target))
    snacks_target = max(0, min(6, snacks_target))

    raw_meals = result.get("daily_plan", [])
    raw_snacks = result.get("snack_plan", [])
    if not isinstance(raw_meals, list):
        raw_meals = []
    if not isinstance(raw_snacks, list):
        raw_snacks = []

    normalized_meals: List[MealPlanEntry] = []
    for entry in raw_meals:
        if isinstance(entry, dict):
            normalized_meals.append(MealPlanEntry(**entry))
    normalized_snacks: List[MealPlanEntry] = []
    for entry in raw_snacks:
        if isinstance(entry, dict):
            normalized_snacks.append(MealPlanEntry(**entry))

    final_meals = _ensure_plan_length(meals_target, normalized_meals, fallback["daily_plan"])
    final_snacks = _ensure_plan_length(snacks_target, normalized_snacks, fallback["snack_plan"])

    state["daily_plan"] = final_meals
    state["snack_plan"] = final_snacks
    state.setdefault("suggestions", [])

    plan_macros = _aggregate_plan_macros(final_meals, final_snacks)
    grocery_list = _grocery_list_from_plan(final_meals, final_snacks)

    state["plan_macros"] = plan_macros
    state["grocery_list_plan"] = grocery_list

    if "water_goal_ml" not in state:
        state["water_goal_ml"] = _compute_water_goal(profile, macros)

    debug = state.get("debug", [])
    debug.append("plan_generated")
    state["debug"] = debug
    
    # Determine the source of the plan (AI or fallback)
    raw_info = state.get("raw", {})
    if not raw_info:
        # If no raw info, this is likely an AI-generated plan
        raw_info = {"source": "ai", "reason": "agent_generated"}
    
    # persist plan (NOTE: This is called during agent execution, not user save)
    # Plans saved here should have saved=False (user hasn't explicitly saved yet)
    db.nutrition_daily_plans.update_one(
        {
            "user_id": _oid(state["user_id"]),
            "date": _today_date_str(),
        },
        {
            "$set": {
                "plan": final_meals,
                "snacks": final_snacks,
                "compliance": state.get("compliance_summary"),
                "suggestions": state.get("suggestions", []),
                "water_goal_ml": state.get("water_goal_ml"),
                "plan_macros": plan_macros,
                "grocery_list": grocery_list,
                "raw": raw_info,
                "saved": False,  # Auto-generated plans are not saved by user yet
                "updated_at": _now(),
            },
        },
        upsert=True,
    )
    return state


async def _node_handle_swaps(state: DietAgentState) -> DietAgentState:
    if not state.get("swap_context"):
        state.setdefault("suggestions", [])
        state.setdefault("debug", []).append("swap_skipped")
        return state
    suggestions = await _generate_swap_suggestions(state)
    state = state.copy()
    state["suggestions"] = suggestions
    state.setdefault("debug", []).append("swap_generated")
    return state


async def _node_finalize(state: DietAgentState) -> DietAgentState:
    debug = state.get("debug", [])
    debug.append("finalized")
    state["debug"] = debug
    return state


def build_diet_agent_graph() -> StateGraph:
    graph = StateGraph(DietAgentState)
    graph.add_node("load_context", _node_load_context)
    graph.add_node("generate_plan", _node_generate_plan)
    graph.add_node("handle_swaps", _node_handle_swaps)
    graph.add_node("finalize", _node_finalize)

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "generate_plan")
    graph.add_edge("generate_plan", "handle_swaps")
    graph.add_edge("handle_swaps", "finalize")
    graph.add_edge("finalize", END)
    return graph


async def _run_diet_agent(user_id: str, swap_context: Optional[dict] = None) -> DietAgentState:
    """
    Diet Optimization Agent run steps:
      - Load latest nutrition profile, macro targets, and recent meal logs
      - Rebalance diet by generating a fresh meal/snack plan via LLM
      - Store plan and suggestions for proactive notifications
      - When swap context provided, offer alternatives while maintaining macros
    """
    graph = build_diet_agent_graph()
    app = graph.compile()
    initial_state: DietAgentState = {
        "user_id": user_id,
        "swap_context": swap_context,
        "daily_plan": [],
        "snack_plan": [],
        "debug": [],
    }
    try:
        result: DietAgentState = await app.ainvoke(initial_state)
    except AgentNodeError as exc:
        logger.error("Diet agent failed, returning fallback", exc_info=exc)
        profile = _get_nutrition_profile(user_id) or {}
        macros = _get_macro_targets(user_id) or {}
        fallback = _build_fallback_plan(profile, macros)
        fallback_state: DietAgentState = {
            "user_id": user_id,
            "profile": profile,
            "macro_targets": macros,
            "meal_logs": [],
            "compliance_summary": predict_daily_compliance(user_id),
            "daily_plan": fallback["daily_plan"],
            "snack_plan": fallback["snack_plan"],
            "swap_context": swap_context,
            "suggestions": [],
            "water_goal_ml": _compute_water_goal(profile, macros),
            "debug": ["fallback"],
            "raw": {"source": "fallback", "reason": "agent_error"},  # Mark as fallback plan
        }
        result = fallback_state
    serialized_plan = _serialize_plan_entries(result.get("daily_plan", []))
    serialized_snacks = _serialize_plan_entries(result.get("snack_plan", []))
    water_goal_ml = result.get("water_goal_ml", 2000)  # Default 2L
    grocery_list = result.get("grocery_list", [])
    
    # Store the daily plan in database (this is a redundant save, already done in _node_generate_plan)
    # However, we keep it to ensure grocery_list and serialized formats are saved
    today = _today_date_str()
    logger.info(f"Storing daily plan for user {user_id} on date {today}")
    
    # Get raw info, ensure it's set
    raw_info = result.get("raw", {})
    if not raw_info:
        raw_info = {"source": "ai", "reason": "agent_generated"}
    
    db.nutrition_daily_plans.update_one(
        {"user_id": _oid(user_id), "date": today},
        {
            "$set": {
                "user_id": _oid(user_id),
                "date": today,
                "plan": serialized_plan,
                "snacks": serialized_snacks,
                "suggestions": result.get("suggestions", []),
                "water_goal_ml": water_goal_ml,
                "plan_macros": result.get("plan_macros"),
                "grocery_list": grocery_list,
                "raw": raw_info,
                "saved": False,  # Auto-generated plans are not user-saved
                "updated_at": _now(),
            }
        },
        upsert=True,
    )
    
    result["daily_plan"] = serialized_plan
    result["snack_plan"] = serialized_snacks
    result["water_goal_ml"] = water_goal_ml
    result["grocery_list"] = grocery_list
    return result


@router.post("/agent/run")
async def agent_run(background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    async def runner():
        await _run_diet_agent(user_id)

    background_tasks.add_task(asyncio.create_task, runner())
    return {"status": "queued"}


@router.post("/agent/plan", response_model=dict)
async def agent_generate_plan(user_id: str = Depends(get_current_user_id)):
    result = await _run_diet_agent(user_id)
    return {
        "plan": _serialize_plan_entries(result.get("daily_plan", [])),
        "snacks": _serialize_plan_entries(result.get("snack_plan", [])),
        "suggestions": result.get("suggestions", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "plan_macros": result.get("plan_macros"),
        "grocery_list": result.get("grocery_list", []),
    }


@router.post("/agent/refresh", response_model=dict)
async def agent_refresh_plan(payload: Dict[str, Any] = Body(default_factory=dict), user_id: str = Depends(get_current_user_id)):
    force = bool(payload.get("force"))
    today = _today_date_str()
    logger.info(f"Refreshing meal plan for user {user_id} on date {today} (force={force})")
    existing = db.nutrition_daily_plans.find_one({
        "user_id": _oid(user_id),
        "date": today,
    })
    
    if existing:
        logger.info(f"Found existing plan for {today}: saved={existing.get('saved')}, source={existing.get('raw', {}).get('source')}")
    if existing and not force:
        # Check if the plan was saved by user
        if existing.get("saved"):
            # Return user-saved plan
            return {
                "plan": _serialize_plan_entries(existing.get("plan", [])),
                "snacks": _serialize_plan_entries(existing.get("snacks", [])),
                "cached": True,
                "saved": True,
                "suggestions": existing.get("suggestions", []),
                "water_goal_ml": existing.get("water_goal_ml"),
                "plan_macros": existing.get("plan_macros"),
                "grocery_list": existing.get("grocery_list", []),
            }
        else:
            # Check if the cached plan was AI-generated or fallback
            raw_source = existing.get("raw", {}).get("source")
            if raw_source == "ai":
                # Return AI-generated cached plan
                return {
                "plan": _serialize_plan_entries(existing.get("plan", [])),
                "snacks": _serialize_plan_entries(existing.get("snacks", [])),
                "cached": True,
                "saved": False,
                "suggestions": existing.get("suggestions", []),
                "water_goal_ml": existing.get("water_goal_ml"),
                "plan_macros": existing.get("plan_macros"),
                "grocery_list": existing.get("grocery_list", []),
            }
            elif raw_source == "fallback":
                # If it was fallback due to AI issues, try to regenerate with fresh AI
                logger.info("Cached fallback plan found, attempting to regenerate with AI")
                # Force regeneration for fallback plans to get better AI-generated content
                force = True
            else:
                # For AI-generated cached plans, return them as cached
                return {
                    "plan": _serialize_plan_entries(existing.get("plan", [])),
                    "snacks": _serialize_plan_entries(existing.get("snacks", [])),
                    "cached": True,
                    "saved": False,
                    "suggestions": existing.get("suggestions", []),
                    "water_goal_ml": existing.get("water_goal_ml"),
                    "plan_macros": existing.get("plan_macros"),
                    "grocery_list": existing.get("grocery_list", []),
                }

    # If we get here, either no cached plan exists or regeneration was requested
    if existing and not force and raw_source == "fallback":
        # If regeneration failed, return the cached fallback plan
        logger.info("Regeneration failed, returning cached fallback plan")
        return {
            "plan": _serialize_plan_entries(existing.get("plan", [])),
            "snacks": _serialize_plan_entries(existing.get("snacks", [])),
            "cached": True,
            "saved": False,
            "suggestions": existing.get("suggestions", []),
            "water_goal_ml": existing.get("water_goal_ml"),
            "plan_macros": existing.get("plan_macros"),
            "grocery_list": existing.get("grocery_list", []),
        }

    # If no plan exists, auto-generate a new plan
    if not existing:
        logger.info("No existing plan found, auto-generating meal plan")
        result = await _run_diet_agent(user_id)

        # Return the generated plan (already saved to database by _run_diet_agent with saved=False)
        return {
            "plan": _serialize_plan_entries(result.get("daily_plan", [])),
            "snacks": _serialize_plan_entries(result.get("snack_plan", [])),
            "cached": False,
            "saved": False,
            "suggestions": result.get("suggestions", []),
            "water_goal_ml": result.get("water_goal_ml"),
            "plan_macros": result.get("plan_macros"),
            "grocery_list": result.get("grocery_list", []),
        }

    # Generate fresh plan (forced regeneration)
    logger.info("Generating fresh meal plan (forced regeneration)")
    result = await _run_diet_agent(user_id)

    # Save the new plan to database
    plan_data = {
        "user_id": _oid(user_id),
        "date": today,
        "plan": result.get("daily_plan", []),
        "snacks": result.get("snack_plan", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "grocery_list": result.get("grocery_list", []),
        "suggestions": result.get("suggestions", []),
        "plan_macros": result.get("plan_macros"),
        "raw": result.get("raw", {}),
        "created_at": _now(),
    }

    # Upsert the plan (replace if exists, insert if new)
    db.nutrition_daily_plans.replace_one(
        {"user_id": _oid(user_id), "date": today},
        plan_data,
        upsert=True
    )

    return {
        "plan": _serialize_plan_entries(result.get("daily_plan", [])),
        "snacks": _serialize_plan_entries(result.get("snack_plan", [])),
        "cached": False,
        "saved": False,
        "suggestions": result.get("suggestions", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "plan_macros": result.get("plan_macros"),
        "grocery_list": result.get("grocery_list", []),
    }


@router.post("/agent/swap", response_model=dict)
async def agent_swap_meal(payload: MealSwapRequest, user_id: str = Depends(get_current_user_id)):
    swap_context = payload.dict(exclude_none=True)
    result = await _run_diet_agent(user_id, swap_context=swap_context)
    
    # Update the daily plan with the new swapped meal
    today = _today_date_str()
    plan_data = {
        "user_id": _oid(user_id),
        "date": today,
        "plan": result.get("daily_plan", []),
        "snacks": result.get("snack_plan", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "grocery_list": result.get("grocery_list", []),
        "suggestions": result.get("suggestions", []),
        "plan_macros": result.get("plan_macros"),
        "raw": result.get("raw", {}),
        "created_at": _now(),
    }
    
    # Update the plan in database
    db.nutrition_daily_plans.replace_one(
        {"user_id": _oid(user_id), "date": today},
        plan_data,
        upsert=True
    )
    
    return {
        "swaps": result.get("suggestions", []),
        "plan": _serialize_plan_entries(result.get("daily_plan", [])),
        "snacks": _serialize_plan_entries(result.get("snack_plan", [])),
        "water_goal_ml": result.get("water_goal_ml"),
        "plan_macros": result.get("plan_macros"),
        "grocery_list": result.get("grocery_list", []),
    }


@router.post("/agent/save", response_model=dict)
async def save_agent_plan(payload: Dict[str, Any] = Body(default_factory=dict), user_id: str = Depends(get_current_user_id)):
    """Save the current agent plan to database"""
    today = _today_date_str()
    logger.info(f"Saving meal plan for user {user_id} on date {today}")

    # Get the current plan data
    plan = payload.get("plan", [])
    snacks = payload.get("snacks", [])

    # Get current user profile and macro targets for water goal computation
    profile = _get_nutrition_profile(user_id) or {}
    macros = _get_macro_targets(user_id) or _seed_default_macros(user_id, profile)

    # Compute fresh water goal based on current profile and macros
    computed_water_goal = _compute_water_goal(profile, macros)

    # Generate fresh grocery list from the current plan
    grocery_list = _grocery_list_from_plan(plan, snacks)

    # Save the plan with saved flag
    plan_data = {
        "user_id": _oid(user_id),
        "date": today,
        "plan": plan,
        "snacks": snacks,
        "water_goal_ml": computed_water_goal,  # Use computed value instead of payload value
        "grocery_list": grocery_list,
        "suggestions": payload.get("suggestions", []),
        "plan_macros": payload.get("plan_macros", {}),
        "raw": {"source": "saved", "reason": "user_saved"},
        "created_at": _now(),
        "saved": True,  # Mark as saved by user
    }

    db.nutrition_daily_plans.replace_one(
        {"user_id": _oid(user_id), "date": today},
        plan_data,
        upsert=True
    )

    # Return the updated plan for consistency
    updated_plan = db.nutrition_daily_plans.find_one({"user_id": _oid(user_id), "date": today})
    return {
        "success": True,
        "message": "Plan saved successfully",
        "plan": _serialize_plan_entries(updated_plan.get("plan", [])),
        "snacks": _serialize_plan_entries(updated_plan.get("snacks", [])),
        "saved": True,
        "water_goal_ml": updated_plan.get("water_goal_ml"),
        "plan_macros": updated_plan.get("plan_macros"),
        "grocery_list": updated_plan.get("grocery_list", []),
    }

@router.post("/agent/auto-generate", response_model=dict)
async def auto_generate_meal_plan(user_id: str = Depends(get_current_user_id)):
    """Automatically generate a meal plan if none exists for today"""
    today = _today_date_str()
    logger.info(f"Auto-generating meal plan for user {user_id} on date {today}")
    
    # Check if plan already exists
    existing_plan = db.nutrition_daily_plans.find_one({
        "user_id": _oid(user_id),
        "date": today,
    })
    
    if existing_plan:
        logger.info("Meal plan already exists for today")
        return {
            "plan": _serialize_plan_entries(existing_plan.get("plan", [])),
            "snacks": _serialize_plan_entries(existing_plan.get("snacks", [])),
            "cached": True,
            "saved": existing_plan.get("saved", False),
            "suggestions": existing_plan.get("suggestions", []),
            "water_goal_ml": existing_plan.get("water_goal_ml"),
            "plan_macros": existing_plan.get("plan_macros"),
            "grocery_list": existing_plan.get("grocery_list", []),
        }
    
    # Generate new plan
    logger.info("Auto-generating meal plan for today")
    result = await _run_diet_agent(user_id)
    
    # Save the new plan to database (use replace_one to avoid duplicate key errors)
    plan_data = {
        "user_id": _oid(user_id),
        "date": today,
        "plan": result.get("daily_plan", []),
        "snacks": result.get("snack_plan", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "grocery_list": result.get("grocery_list", []),
        "suggestions": result.get("suggestions", []),
        "plan_macros": result.get("plan_macros"),
        "raw": result.get("raw", {}),
        "created_at": _now(),
    }
    
    db.nutrition_daily_plans.replace_one(
        {"user_id": _oid(user_id), "date": today},
        plan_data,
        upsert=True
    )
    logger.info("Auto-generated meal plan saved to database")
    
    return {
        "plan": _serialize_plan_entries(result.get("daily_plan", [])),
        "snacks": _serialize_plan_entries(result.get("snack_plan", [])),
        "cached": False,
        "saved": False,
        "suggestions": result.get("suggestions", []),
        "water_goal_ml": result.get("water_goal_ml"),
        "plan_macros": result.get("plan_macros"),
        "grocery_list": result.get("grocery_list", []),
    }

# ---------- Nutrition Profile collection ----------
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

@router.get("/profile", response_model=Optional[NutritionProfileOut])
def get_nutrition_profile(user_id: str = Depends(get_current_user_id)):
    doc = db.nutrition_profiles.find_one({"user_id": _oid(user_id)})
    if not doc:
        return None
    return NutritionProfileOut(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        diet_type=doc.get("diet_type"),
        allergies=doc.get("allergies", []),
        disliked_foods=doc.get("disliked_foods"),
        favorite_cuisines=doc.get("favorite_cuisines", []),
        meals_per_day=doc.get("meals_per_day"),
        snacks_per_day=doc.get("snacks_per_day"),
        cooking_time_preference=doc.get("cooking_time_preference"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )

@router.post("/profile", response_model=NutritionProfileOut)
def upsert_nutrition_profile(payload: NutritionProfileIn, user_id: str = Depends(get_current_user_id)):
    now = _now()
    body = { **payload.dict(), "updated_at": now }
    existing = db.nutrition_profiles.find_one({"user_id": _oid(user_id)})
    if existing:
        db.nutrition_profiles.update_one({"_id": existing["_id"]}, {"$set": body})
        saved = db.nutrition_profiles.find_one({"_id": existing["_id"]})
    else:
        doc = { **body, "created_at": now, "user_id": _oid(user_id) }
        res = db.nutrition_profiles.insert_one(doc)
        saved = db.nutrition_profiles.find_one({"_id": res.inserted_id})
    return NutritionProfileOut(
        id=str(saved["_id"]),
        user_id=str(saved["user_id"]),
        diet_type=saved.get("diet_type"),
        allergies=saved.get("allergies", []),
        disliked_foods=saved.get("disliked_foods"),
        favorite_cuisines=saved.get("favorite_cuisines", []),
        meals_per_day=saved.get("meals_per_day"),
        snacks_per_day=saved.get("snacks_per_day"),
        cooking_time_preference=saved.get("cooking_time_preference"),
        created_at=saved["created_at"],
        updated_at=saved["updated_at"],
    )

# ---------- Health-check endpoints for module ----------
@router.get("/health")
def health():
    return {"ok": True, "ai_available": bool(groq_client)}


def _serialize_plan_entries(entries: List[MealPlanEntry]) -> List[Dict[str, Any]]:
    serialized = []
    for entry in entries:
        serialized.append({
            "meal_type": entry.get("meal_type"),
            "title": entry.get("title"),
            "calories": entry.get("calories"),
            "protein_g": entry.get("protein_g"),
            "carbs_g": entry.get("carbs_g"),
            "fats_g": entry.get("fats_g"),
            "ingredients": entry.get("ingredients", []),
            "steps": entry.get("steps", []),
        })
    return serialized
