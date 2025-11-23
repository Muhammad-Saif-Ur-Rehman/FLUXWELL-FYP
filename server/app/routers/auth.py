from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request
from pymongo import MongoClient
from pydantic import BaseModel, EmailStr
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import logging
import bcrypt
import jwt as pyjwt
from typing import Optional
from ..models.user import OnboardingUpdateRequest, OnboardingData, OnboardingStep1, OnboardingStep2, UserResponse, SocialAuthData, OnboardingDataResponse, AIAssessmentResult, OnboardingNutrition
from ..auth.jwt_auth import get_current_user
from app.models.nutrition_profile import NutritionProfileIn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Auth"])

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_TIME_HOURS = 24

# Security
security = HTTPBearer()

# Pydantic Models
class UserRegistration(BaseModel):
    fullName: str
    email: EmailStr
    password: str
    confirmPassword: str
    gender: str
    dateOfBirth: str
    agreeToTerms: bool

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# UserResponse is now imported from models.user

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
    onboarding_completed: bool

# Utility Functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_TIME_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = pyjwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# get_current_user function is now imported from jwt_auth.py

# MongoDB Connection
try:
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        raise ValueError("MONGODB_URI environment variable not set")
    
    client = MongoClient(mongodb_uri)
    # Test connection
    client.admin.command('ping')
    db = client["fluxwell"]
    users_collection = db["users"]
    nutrition_profiles_collection = db["nutrition_profiles"]
    logger.info("MongoDB Atlas connected successfully")
except Exception as e:
    logger.error(f"MongoDB connection failed: {e}")
    raise

# OAuth Setup
oauth = OAuth()

# Check OAuth credentials
google_client_id = os.getenv("GOOGLE_CLIENT_ID")
google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
fitbit_client_id = os.getenv("FITBIT_CLIENT_ID")
fitbit_client_secret = os.getenv("FITBIT_CLIENT_SECRET")

# Configure Google OAuth
if not google_client_id or not google_client_secret:
    logger.warning("Google OAuth credentials not found in environment variables")
else:
    oauth.register(
        name='google',
        client_id=google_client_id,
        client_secret=google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs = {
        "scope": "openid email profile https://www.googleapis.com/auth/fitness.activity.read "
                "https://www.googleapis.com/auth/fitness.heart_rate.read "
                "https://www.googleapis.com/auth/fitness.blood_glucose.read "
                "https://www.googleapis.com/auth/fitness.blood_pressure.read "
                "https://www.googleapis.com/auth/fitness.oxygen_saturation.read "
                "https://www.googleapis.com/auth/fitness.sleep.read "
                "https://www.googleapis.com/auth/fitness.body_temperature.read "
                "https://www.googleapis.com/auth/fitness.location.read"
        },
    )
    logger.info("Google OAuth configured successfully")

# Configure Fitbit OAuth
if not fitbit_client_id or not fitbit_client_secret:
    logger.warning("Fitbit OAuth credentials not found in environment variables")
else:
    # Request the scopes needed for intraday metrics and health signals
    # Reference: Fitbit OAuth2 Tutorial (Refresh Tokens & Access User Data)
    # https://dev.fitbit.com/build/reference/web-api/troubleshooting-guide/oauth2-tutorial/
    fitbit_scopes = "activity heartrate location sleep profile settings weight oxygen_saturation temperature"
    oauth.register(
        name='fitbit',
        client_id=fitbit_client_id,
        client_secret=fitbit_client_secret,
        access_token_url="https://api.fitbit.com/oauth2/token",
        authorize_url="https://www.fitbit.com/oauth2/authorize",
        client_kwargs={
            "scope": fitbit_scopes
        },
    )
    logger.info("Fitbit OAuth configured successfully")

# Form-based Authentication Endpoints
@router.post("/register", response_model=dict)
async def register_user(user_data: UserRegistration):
    """Register a new user with form data"""
    try:
        # Validate passwords match
        if user_data.password != user_data.confirmPassword:
            raise HTTPException(status_code=400, detail="Passwords do not match")
        
        # Check password strength (basic validation)
        if len(user_data.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        
        # Check if user already exists
        existing_user = users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        
        # Validate terms agreement
        if not user_data.agreeToTerms:
            raise HTTPException(status_code=400, detail="You must agree to the terms and conditions")
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create new user with initialized onboarding structure
        new_user = {
            "full_name": user_data.fullName,
            "email": user_data.email,
            "password": hashed_password,
            "gender": user_data.gender,
            "date_of_birth": user_data.dateOfBirth,
            "auth_provider": "form",
            "created_at": datetime.utcnow(),
            "onboarding_completed": False,
            "onboarding": {
                "step1": {
                    "gender": user_data.gender,
                    "date_of_birth": user_data.dateOfBirth,
                    "weight": "",
                    "height": "",
                    "profile_picture_url": None
                },
                "step2": {
                    "activity_level": "",
                    "medical_conditions": [],
                    "fitness_goals": [],
                    "time_available": "",
                    "preferred_workout_type": "",
                    "other_medical_condition": "",
                    "custom_goal": ""
                },
                "completed": False
            }
        }
        
        result = users_collection.insert_one(new_user)
        logger.info(f"New user registered with ID: {result.inserted_id}")
        
        return {
            "message": "User registered successfully",
            "user_id": str(result.inserted_id),
            "redirect_to": "login"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@router.post("/login", response_model=TokenResponse)
async def login_user(user_credentials: UserLogin):
    """Authenticate user with email and password"""
    try:
        # Find user by email
        user = users_collection.find_one({"email": user_credentials.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Verify password (only for form-registered users)
        if user.get("auth_provider") == "form":
            if not verify_password(user_credentials.password, user["password"]):
                raise HTTPException(status_code=401, detail="Invalid email or password")
        else:
            raise HTTPException(status_code=401, detail="This account uses social login. Please use Google or Fitbit login.")
        
        # Create access token
        access_token = create_access_token(data={"sub": str(user["_id"])})
        
        # Create user response
        user_response = UserResponse(
            id=str(user["_id"]),
            full_name=user["full_name"],
            email=user["email"],
            auth_provider=user["auth_provider"],
            onboarding_completed=user.get("onboarding_completed", False),
            created_at=user["created_at"]
        )
        
        logger.info(f"User logged in: {user['email']}")
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=user_response,
            onboarding_completed=user.get("onboarding_completed", False)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@router.get("/me")
async def get_current_user_info(current_user=Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=str(current_user["_id"]),
        full_name=current_user["full_name"],
        email=current_user["email"],
        auth_provider=current_user["auth_provider"],
        profile_picture_url=current_user.get("profile_picture_url"),
        onboarding_completed=current_user.get("onboarding_completed", False),
        created_at=current_user["created_at"]
    )

@router.post("/complete-onboarding")
async def complete_onboarding(current_user=Depends(get_current_user)):
    """Mark user's onboarding as completed"""
    try:
        # Update user's onboarding status in database
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": {
                "onboarding_completed": True,
                "onboarding_completed_at": datetime.utcnow(),
                "onboarding.completed": True,
                "onboarding.completed_at": datetime.utcnow()
            }}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Failed to update onboarding status")
        
        logger.info(f"Onboarding completed for user: {current_user['email']}")
        
        return {
            "message": "Onboarding completed successfully",
            "onboarding_completed": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing onboarding: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete onboarding")

@router.post("/onboarding/save")
async def save_onboarding_data(
    onboarding_data: OnboardingUpdateRequest,
    current_user=Depends(get_current_user)
):
    """Save onboarding data for the current user"""
    try:
        update_data = {"updated_at": datetime.utcnow()}
        
        # Prepare onboarding data updates
        if onboarding_data.step1:
            update_data["onboarding.step1"] = onboarding_data.step1.dict(exclude_none=True)
        
        if onboarding_data.step2:
            update_data["onboarding.step2"] = onboarding_data.step2.dict(exclude_none=True)
        
        # Note: Nutrition data is no longer stored in user onboarding
        # It should be saved separately using the nutrition profile endpoint
        
        if onboarding_data.complete:
            update_data["onboarding_completed"] = True
            update_data["onboarding.completed"] = True
            update_data["onboarding.completed_at"] = datetime.utcnow()
        
        # Update user document
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        logger.info(f"Onboarding data saved for user: {current_user['email']}")
        
        return {
            "message": "Onboarding data saved successfully",
            "onboarding_completed": onboarding_data.complete
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save onboarding data error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save onboarding data")

def merge_social_auth_data(user: dict) -> dict:
    """Merge social authentication data with user profile data"""
    merged_data = {}
    social_auth_data = user.get("social_auth_data", {})
    auth_provider = user.get("auth_provider", "")
    
    # Extract data from Google
    if auth_provider == "google" and social_auth_data.get("google"):
        google_data = social_auth_data["google"]
        if google_data.get("given_name") and google_data.get("family_name"):
            merged_data["full_name"] = f"{google_data['given_name']} {google_data['family_name']}"
        if google_data.get("picture"):
            merged_data["profile_picture_url"] = google_data["picture"]
        if google_data.get("email"):
            merged_data["email"] = google_data["email"]
        # Google doesn't typically provide gender or birthdate in basic scope
    
    # Extract data from Fitbit
    elif auth_provider == "fitbit" and social_auth_data.get("fitbit"):
        fitbit_data = social_auth_data["fitbit"]
        if fitbit_data.get("fullName"):
            merged_data["full_name"] = fitbit_data["fullName"]
        if fitbit_data.get("avatar"):
            merged_data["profile_picture_url"] = fitbit_data["avatar"]
        if fitbit_data.get("gender"):
            merged_data["gender"] = fitbit_data["gender"].lower()
        if fitbit_data.get("dateOfBirth"):
            merged_data["date_of_birth"] = fitbit_data["dateOfBirth"]
        if fitbit_data.get("weight"):
            merged_data["weight"] = str(fitbit_data["weight"])
        if fitbit_data.get("height"):
            merged_data["height"] = str(fitbit_data["height"])
    
    return merged_data

@router.get("/onboarding/data")
async def get_onboarding_data(current_user=Depends(get_current_user)):
    """Get onboarding data for the current user with social auth data merged"""
    try:
        # Optimized query - only get necessary fields
        user = users_collection.find_one(
            {"_id": current_user["_id"]},
            {
                "onboarding": 1, 
                "gender": 1, 
                "date_of_birth": 1, 
                "profile_picture_url": 1, 
                "onboarding_completed": 1,
                "auth_provider": 1,
                "social_auth_data": 1
            }
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Extract existing onboarding data with defaults
        onboarding_data = user.get("onboarding", {})
        step1_data = onboarding_data.get("step1", {})
        step2_data = onboarding_data.get("step2", {})
        # Note: nutrition_data is no longer stored in user onboarding
        # Use /nutrition/profile endpoint to get nutrition data
        
        # Quick social auth data extraction (simplified)
        social_merged_data = {}
        auth_provider = user.get("auth_provider", "")
        if auth_provider in ["google", "fitbit"]:
            social_auth_data = user.get("social_auth_data", {})
            if auth_provider == "google" and social_auth_data.get("google"):
                google_data = social_auth_data["google"]
                social_merged_data = {
                    "profile_picture_url": google_data.get("picture"),
                    "gender": google_data.get("gender", ""),
                }
            elif auth_provider == "fitbit" and social_auth_data.get("fitbit"):
                fitbit_data = social_auth_data["fitbit"]
                social_merged_data = {
                    "profile_picture_url": fitbit_data.get("avatar640") or fitbit_data.get("avatar150"),
                    "gender": fitbit_data.get("gender", ""),
                    "date_of_birth": fitbit_data.get("dateOfBirth", ""),
                    "weight": str(fitbit_data.get("weight", "")),
                    "height": str(fitbit_data.get("height", "")),
                }
        
        # Fast merge with fallbacks
        merged_step1 = {
            "gender": step1_data.get("gender") or user.get("gender") or social_merged_data.get("gender") or "",
            "date_of_birth": step1_data.get("date_of_birth") or user.get("date_of_birth") or social_merged_data.get("date_of_birth") or "",
            "weight": step1_data.get("weight") or social_merged_data.get("weight") or "",
            "height": step1_data.get("height") or social_merged_data.get("height") or "",
            "profile_picture_url": step1_data.get("profile_picture_url") or user.get("profile_picture_url") or social_merged_data.get("profile_picture_url") or None
        }
        
        # Fast step2 defaults
        merged_step2 = {
            "activity_level": step2_data.get("activity_level", ""),
            "medical_conditions": step2_data.get("medical_conditions", []),
            "fitness_goals": step2_data.get("fitness_goals", []),
            "time_available": step2_data.get("time_available", ""),
            "preferred_workout_type": step2_data.get("preferred_workout_type", ""),
            "other_medical_condition": step2_data.get("other_medical_condition", ""),
            "custom_goal": step2_data.get("custom_goal", "")
        }
        
        # Nutrition data is no longer returned here
        # Use /nutrition/profile endpoint to get nutrition profile data
        merged_nutrition = None
        
        return {
            "step1": merged_step1,
            "step2": merged_step2,
            "nutrition": merged_nutrition,
            "ai_assessment": onboarding_data.get("ai_assessment", None),
            "completed": onboarding_data.get("completed", False),
            "onboarding_completed": user.get("onboarding_completed", False),
            "has_social_data": bool(social_merged_data),
            "social_provider": auth_provider if auth_provider in ["google", "fitbit"] else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get onboarding data error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve onboarding data")

@router.put("/onboarding/step1")
async def update_onboarding_step1(
    step1_data: OnboardingStep1,
    current_user=Depends(get_current_user)
):
    """Update only step 1 onboarding data"""
    try:
        # Prepare update data
        update_data = {
            "onboarding.step1": step1_data.dict(exclude_none=True),
            "updated_at": datetime.utcnow()
        }
        
        # Update user in database
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Failed to update step 1 data")
        
        logger.info(f"Step 1 onboarding data updated for user: {current_user['email']}")
        
        return {"success": True, "message": "Step 1 data updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update step 1 error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update step 1 data")

@router.put("/onboarding/step2")
async def update_onboarding_step2(
    step2_data: OnboardingStep2,
    current_user=Depends(get_current_user)
):
    """Update only step 2 onboarding data"""
    try:
        # Prepare update data
        update_data = {
            "onboarding.step2": step2_data.dict(exclude_none=True),
            "updated_at": datetime.utcnow()
        }
        
        # Update user in database
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Failed to update step 2 data")
        
        logger.info(f"Step 2 onboarding data updated for user: {current_user['email']}")
        
        return {"success": True, "message": "Step 2 data updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update step 2 error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update step 2 data")

@router.put("/onboarding/nutrition")
async def update_onboarding_nutrition(
    nutrition_data: OnboardingNutrition,
    current_user=Depends(get_current_user)
):
    """Update nutrition onboarding data"""
    try:
        allowed_diets = {"Balanced", "Low Carb", "Vegetarian", "Vegan", "Keto", "Paleo", "Custom"}
        payload = nutrition_data.dict(exclude_none=True)
        diet = payload.get("diet_type")
        if diet and isinstance(diet, str) and diet not in allowed_diets and len(diet) > 64:
            raise HTTPException(status_code=400, detail="Invalid diet_type")
        if payload.get("meals_per_day") is not None:
            payload["meals_per_day"] = max(1, min(8, int(payload["meals_per_day"])))
        if payload.get("snacks_per_day") is not None:
            payload["snacks_per_day"] = max(0, min(6, int(payload["snacks_per_day"])))

        now = datetime.utcnow()
        profile_doc = {
            "diet_type": payload.get("diet_type"),
            "allergies": payload.get("allergies", []),
            "disliked_foods": payload.get("disliked_foods"),
            "favorite_cuisines": payload.get("favorite_cuisines", []),
            "meals_per_day": payload.get("meals_per_day"),
            "snacks_per_day": payload.get("snacks_per_day"),
            "cooking_time_preference": payload.get("cooking_time_preference"),
            "updated_at": now,
        }

        existing_profile = nutrition_profiles_collection.find_one({"user_id": current_user["_id"]})
        if existing_profile:
            nutrition_profiles_collection.update_one({"_id": existing_profile["_id"]}, {"$set": profile_doc})
        else:
            profile_doc["created_at"] = now
            profile_doc["user_id"] = current_user["_id"]
            nutrition_profiles_collection.insert_one(profile_doc)

        # Note: Nutrition data is now stored only in nutrition_profiles collection
        # No longer storing in user onboarding data to maintain separation

        saved = nutrition_profiles_collection.find_one({"user_id": current_user["_id"]})
        return {
            "success": True,
            "message": "Nutrition data updated successfully",
            "nutrition": payload,
            "nutrition_exists": True,
            "profile_id": str(saved["_id"])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update nutrition error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update nutrition data")

@router.get("/onboarding/nutrition")
async def get_onboarding_nutrition(current_user=Depends(get_current_user)):
    """Get nutrition data from nutrition profiles collection only."""
    try:
        profile = nutrition_profiles_collection.find_one({"user_id": current_user["_id"]})
        if not profile:
            # Return default values if no profile exists
            nutrition = {
                "diet_type": "Balanced",
                "allergies": [],
                "disliked_foods": "",
                "favorite_cuisines": [],
                "meals_per_day": None,
                "snacks_per_day": None,
                "cooking_time_preference": None,
            }
            return {"nutrition": nutrition, "nutrition_exists": False}
        
        nutrition = {
            "diet_type": profile.get("diet_type", "Balanced"),
            "allergies": profile.get("allergies", []),
            "disliked_foods": profile.get("disliked_foods", ""),
            "favorite_cuisines": profile.get("favorite_cuisines", []),
            "meals_per_day": profile.get("meals_per_day"),
            "snacks_per_day": profile.get("snacks_per_day"),
            "cooking_time_preference": profile.get("cooking_time_preference"),
        }
        return {"nutrition": nutrition, "nutrition_exists": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get nutrition onboarding error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch nutrition data")

@router.post("/onboarding/ai-assessment")
async def save_ai_assessment(
    assessment_data: AIAssessmentResult,
    current_user=Depends(get_current_user)
):
    """Save AI assessment results to user's onboarding data"""
    try:
        # Prepare update data
        assessment_with_timestamp = {
            "time_to_goal": assessment_data.time_to_goal,
            "motivational_message": assessment_data.motivational_message,
            "health_score": assessment_data.health_score,
            "risk_profile": assessment_data.risk_profile,
            "predicted_calories": assessment_data.predicted_calories,
            "generated_at": datetime.utcnow()
        }
        
        update_data = {
            "onboarding.ai_assessment": assessment_with_timestamp,
            "updated_at": datetime.utcnow()
        }
        
        # Update user in database
        result = users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            # If no modification, try to create the onboarding structure
            users_collection.update_one(
                {"_id": current_user["_id"]},
                {
                    "$set": {
                        "onboarding": {
                            "ai_assessment": assessment_with_timestamp,
                            "completed": False
                        },
                        "updated_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
        
        logger.info(f"AI assessment saved for user: {current_user['email']}")
        
        return {"success": True, "message": "AI assessment saved successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Save AI assessment error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save AI assessment")

@router.get("/google")
async def google_login(request: Request):
    try:
        # Use absolute URL for callback instead of url_for
        callback_url = f"{request.base_url}auth/google/callback"
        logger.info(f"Redirecting to Google OAuth with callback: {callback_url}")
        return await oauth.google.authorize_redirect(request, callback_url)
    except Exception as e:
        logger.error(f"Error in google_login: {e}")
        raise HTTPException(status_code=500, detail=f"OAuth initialization failed: {str(e)}")

@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request):
    try:
        logger.info("Processing Google OAuth callback")
        token = await oauth.google.authorize_access_token(request)
        
        if not token:
            logger.error("No token received from Google")
            raise HTTPException(status_code=400, detail="Authorization failed")
        
        user_info = token.get("userinfo")
        if not user_info:
            logger.error("No user info received from Google")
            raise HTTPException(status_code=400, detail="Failed to get user information")

        logger.info(f"User authenticated: {user_info.get('email')}")
        
        # Check if this is a health service connection for an existing form user
        connecting_user_id = request.session.get("connecting_user_id")
        connection_intent = request.session.get("connection_intent")
        
        if connecting_user_id and connection_intent == "health_service":
            logger.info(f"Processing health service connection for user {connecting_user_id}")
            return await handle_health_service_connection(request, user_info, token, connecting_user_id)
        
        # Regular login flow
        # Check if user already exists
        existing_user = users_collection.find_one({"email": user_info["email"]})

        if not existing_user:
            # Get Google Fit access token
            google_access_token = token.get("access_token")
            
            new_user = {
                "full_name": user_info.get("name"),
                "email": user_info.get("email"),
                "profile_picture_url": user_info.get("picture"),
                "auth_provider": "google",
                "google_id": user_info.get("sub"),
                "gender": user_info.get("gender"),  # Google may provide this
                "created_at": datetime.utcnow(),
                "onboarding_completed": False,
                "access_token": google_access_token,  # Store Google Fit access token
                "token_expires_at": datetime.utcnow() + timedelta(hours=1) if google_access_token else None,
                "social_auth_data": {
                    "google": user_info
                },
                "onboarding": {
                    "step1": {
                        "gender": user_info.get("gender", ""),
                        "date_of_birth": "",
                        "weight": "",
                        "height": "",
                        "profile_picture_url": user_info.get("picture")
                    },
                    "step2": {
                        "activity_level": "",
                        "medical_conditions": [],
                        "fitness_goals": [],
                        "time_available": "",
                        "preferred_workout_type": "",
                        "other_medical_condition": "",
                        "custom_goal": ""
                    },
                    "completed": False
                }
            }
            result = users_collection.insert_one(new_user)
            logger.info(f"New user created with ID: {result.inserted_id}")
            
            # Create JWT token for new user
            access_token = create_access_token(data={"sub": str(result.inserted_id)})
            
            # Redirect new users directly to onboarding with token
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
            redirect_url = f"{frontend_url}/onboarding?token={access_token}&new_user=true"
            logger.info(f"Redirecting new user to onboarding: {redirect_url}")
            
            return RedirectResponse(url=redirect_url)
        else:
            logger.info(f"Existing user logged in: {user_info['email']}")
            
            # Update user with Google Fit access token for real-time data
            google_access_token = token.get("access_token")
            if google_access_token:
                users_collection.update_one(
                    {"_id": existing_user["_id"]},
                    {
                        "$set": {
                            "access_token": google_access_token,
                            "token_expires_at": datetime.utcnow() + timedelta(hours=1),  # Google tokens typically expire in 1 hour
                            "social_auth_data.google": user_info
                        }
                    }
                )
                logger.info("Updated user with Google Fit access token")
            
            # Create JWT token for existing user
            access_token = create_access_token(data={"sub": str(existing_user["_id"])})
            
            # Check if user has completed onboarding
            has_completed_onboarding = existing_user.get("onboarding_completed", False)
            
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
            
            if not has_completed_onboarding:
                # Redirect to onboarding if not completed
                redirect_url = f"{frontend_url}/onboarding?token={access_token}"
                logger.info(f"Redirecting existing user to onboarding: {redirect_url}")
            else:
                # Redirect to dashboard if onboarding completed
                redirect_url = f"{frontend_url}/dashboard?token={access_token}"
                logger.info(f"Redirecting existing user to dashboard: {redirect_url}")
            
            return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        logger.error(f"Error in google_callback: {e}")
        # Redirect to signup page with error
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        error_url = f"{frontend_url}/signup?error=oauth_failed"
        return RedirectResponse(url=error_url)

def _get_public_backend_base(request: Request) -> str:
    """Return a stable public base URL for OAuth redirects.
    Prefer PUBLIC_BACKEND_URL env (e.g., http://localhost:8000 or https://your-ngrok-domain),
    otherwise fall back to request.base_url.
    """
    public_base = os.getenv("PUBLIC_BACKEND_URL")
    if public_base:
        return public_base.rstrip("/") + "/"
    # Fallback to request base_url
    return str(request.base_url)

async def handle_health_service_connection(request: Request, user_info: dict, token: dict, connecting_user_id: str):
    """Handle OAuth callback for connecting Google health service to existing form user"""
    try:
        from bson import ObjectId
        user_object_id = ObjectId(connecting_user_id)
        
        # Update the existing form user with Google OAuth data
        # IMPORTANT: Preserve original auth_provider to maintain login capability
        update_data = {
            "health_service_provider": "google",  # Track health service separately
            "google_id": user_info.get('id'),
            "access_token": token.get('access_token'),
            "refresh_token": token.get('refresh_token'),
            "token_expires_at": datetime.utcnow() + timedelta(seconds=token.get('expires_in', 3600)),
            "social_auth_data.google": user_info,
            "updated_at": datetime.utcnow()
        }
        
        result = users_collection.update_one(
            {"_id": user_object_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to update user with Google OAuth data")
        
        logger.info(f"Form user {connecting_user_id} connected to Google Fit successfully")
        
        # Clear the session
        request.session.pop("connecting_user_id", None)
        request.session.pop("connection_intent", None)
        
        # Redirect to a success page that will communicate with the parent window
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        success_url = f"{frontend_url}/auth-success?provider=google&type=health_service"
        return RedirectResponse(url=success_url)
        
    except Exception as e:
        logger.error(f"Error in handle_health_service_connection: {e}")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        error_url = f"{frontend_url}/auth-error?provider=google&type=health_service&error=connection_failed"
        return RedirectResponse(url=error_url)

async def handle_fitbit_health_service_connection(request: Request, user_info: dict, token: dict, connecting_user_id: str):
    """Handle OAuth callback for connecting Fitbit health service to existing form user"""
    try:
        from bson import ObjectId
        user_object_id = ObjectId(connecting_user_id)
        
        # Update the existing form user with Fitbit OAuth data
        # IMPORTANT: Preserve original auth_provider to maintain login capability
        update_data = {
            "health_service_provider": "fitbit",  # Track health service separately
            "fitbit_id": user_info.get('encodedId'),
            "access_token": token.get('access_token'),
            "refresh_token": token.get('refresh_token'),
            "token_expires_at": datetime.utcnow() + timedelta(seconds=token.get('expires_in', 3600)),
            "social_auth_data.fitbit": user_info,
            "updated_at": datetime.utcnow()
        }
        
        result = users_collection.update_one(
            {"_id": user_object_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to update user with Fitbit OAuth data")
        
        logger.info(f"Form user {connecting_user_id} connected to Fitbit successfully")
        
        # Clear the session
        request.session.pop("connecting_user_id", None)
        request.session.pop("connection_intent", None)
        
        # Redirect to frontend with success message
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        redirect_url = f"{frontend_url}/realtime?connected=fitbit"
        return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        logger.error(f"Error in handle_fitbit_health_service_connection: {e}")
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        error_url = f"{frontend_url}/realtime?error=fitbit_connect_failed"
        return RedirectResponse(url=error_url)


@router.get("/fitbit")
async def fitbit_login(request: Request):
    try:
        # Use stable public URL for callback to match Fitbit app settings
        base = _get_public_backend_base(request)
        callback_url = f"{base}auth/fitbit/callback"
        logger.info(f"Redirecting to Fitbit OAuth with callback: {callback_url}")
        return await oauth.fitbit.authorize_redirect(request, callback_url)
    except Exception as e:
        logger.error(f"Error in fitbit_login: {e}")
        raise HTTPException(status_code=500, detail=f"Fitbit OAuth initialization failed: {str(e)}")

@router.get("/fitbit/callback", name="fitbit_callback")
async def fitbit_callback(request: Request):
    try:
        logger.info("Processing Fitbit OAuth callback")
        token = await oauth.fitbit.authorize_access_token(request)
        
        if not token:
            logger.error("No token received from Fitbit")
            raise HTTPException(status_code=400, detail="Authorization failed")
        
        # Get user profile from Fitbit API
        resp = await oauth.fitbit.get('https://api.fitbit.com/1/user/-/profile.json', token=token)
        user_data = resp.json()
        
        if not user_data or 'user' not in user_data:
            logger.error("No user data received from Fitbit")
            raise HTTPException(status_code=400, detail="Failed to get user information")

        user_info = user_data['user']
        logger.info(f"Fitbit user authenticated: {user_info.get('encodedId')}")
        
        # Check if this is a health service connection for an existing form user
        connecting_user_id = request.session.get("connecting_user_id")
        connection_intent = request.session.get("connection_intent")
        
        if connecting_user_id and connection_intent == "health_service":
            logger.info(f"Processing Fitbit health service connection for user {connecting_user_id}")
            return await handle_fitbit_health_service_connection(request, user_info, token, connecting_user_id)
        
        # Regular login flow
        # Create email from Fitbit user data (Fitbit doesn't always provide email)
        email = user_info.get('email') or f"fitbit_{user_info.get('encodedId')}@fitbit.local"
        
        # Check if user already exists
        existing_user = users_collection.find_one({"email": email})

        if not existing_user:
            new_user = {
                "full_name": user_info.get('fullName') or user_info.get('displayName'),
                "email": email,
                "profile_picture_url": user_info.get('avatar640') or user_info.get('avatar150'),
                "auth_provider": "fitbit",
                "fitbit_id": user_info.get('encodedId'),
                "access_token": token.get('access_token'),
                "refresh_token": token.get('refresh_token'),
                "token_expires_at": datetime.utcnow() + timedelta(seconds=token.get('expires_in', 3600)),
                "gender": user_info.get('gender'),
                "date_of_birth": user_info.get('dateOfBirth'),
                "timezone": user_info.get('timezone'),
                "created_at": datetime.utcnow(),
                "onboarding_completed": False,
                "social_auth_data": {
                    "fitbit": user_info
                },
                "onboarding": {
                    "step1": {
                        "gender": user_info.get('gender', ""),
                        "date_of_birth": user_info.get('dateOfBirth', ""),
                        "weight": str(user_info.get('weight', "")),
                        "height": str(user_info.get('height', "")),
                        "profile_picture_url": user_info.get('avatar640') or user_info.get('avatar150')
                    },
                    "step2": {
                        "activity_level": "",
                        "medical_conditions": [],
                        "fitness_goals": [],
                        "time_available": "",
                        "preferred_workout_type": "",
                        "other_medical_condition": "",
                        "custom_goal": ""
                    },
                    "completed": False
                }
            }
            result = users_collection.insert_one(new_user)
            logger.info(f"New Fitbit user created with ID: {result.inserted_id}")
            
            # Create JWT token for new user
            access_token = create_access_token(data={"sub": str(result.inserted_id)})
            
            # Redirect new users directly to onboarding with token
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
            redirect_url = f"{frontend_url}/onboarding?token={access_token}&new_user=true"
            logger.info(f"Redirecting new Fitbit user to onboarding: {redirect_url}")
            
            return RedirectResponse(url=redirect_url)
        else:
            # Update user info
            users_collection.update_one(
                {"email": email},
                {"$set": {
                    "full_name": user_info.get('fullName') or user_info.get('displayName'),
                    "profile_picture_url": user_info.get('avatar640') or user_info.get('avatar150'),
                    "access_token": token.get('access_token'),
                    "refresh_token": token.get('refresh_token'),
                    "token_expires_at": datetime.utcnow() + timedelta(seconds=token.get('expires_in', 3600)),
                    "updated_at": datetime.utcnow(),
                    "social_auth_data.fitbit": user_info
                }}
            )
            logger.info(f"Existing Fitbit user logged in: {email}")
            
            # Create JWT token for existing user
            access_token = create_access_token(data={"sub": str(existing_user["_id"])})
            
            # Check if user has completed onboarding
            has_completed_onboarding = existing_user.get("onboarding_completed", False)
            
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
            
            if not has_completed_onboarding:
                # Redirect to onboarding if not completed
                redirect_url = f"{frontend_url}/onboarding?token={access_token}"
                logger.info(f"Redirecting existing Fitbit user to onboarding: {redirect_url}")
            else:
                # Redirect to dashboard if onboarding completed
                redirect_url = f"{frontend_url}/dashboard?token={access_token}"
                logger.info(f"Redirecting existing Fitbit user to dashboard: {redirect_url}")
            
            return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        logger.error(f"Error in fitbit_callback: {e}")
        # Redirect to signup page with error
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
        error_url = f"{frontend_url}/signup?error=fitbit_oauth_failed"
        return RedirectResponse(url=error_url)

# Test endpoint to verify configuration
@router.get("/test")
async def test_auth():
    return {
        "message": "Auth router is working",
        "mongodb_connected": users_collection is not None,
        "google_oauth_configured": bool(google_client_id and google_client_secret),
        "fitbit_oauth_configured": bool(fitbit_client_id and fitbit_client_secret),
        "google_client_id_set": bool(os.getenv("GOOGLE_CLIENT_ID")),
        "google_client_secret_set": bool(os.getenv("GOOGLE_CLIENT_SECRET")),
        "fitbit_client_id_set": bool(os.getenv("FITBIT_CLIENT_ID")),
        "fitbit_client_secret_set": bool(os.getenv("FITBIT_CLIENT_SECRET")),
        "mongodb_uri_set": bool(os.getenv("MONGODB_URI")),
        "frontend_url": os.getenv('FRONTEND_URL', 'http://localhost:5173'),
        "status": "ready"
    }

@router.post("/connect-health-service")
async def connect_health_service(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Connect a health service (Google Fit or Fitbit) to an existing form user"""
    try:
        user_id = current_user.get("_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        # Check if user is a form user
        if current_user.get("auth_provider") != "form":
            raise HTTPException(status_code=400, detail="Only form users can connect health services")
        
        # Get the health service provider from request body
        body = await request.json()
        provider = body.get("provider")
        
        if provider != "google":
            raise HTTPException(status_code=400, detail="Invalid provider. Only Google Fit is supported for form users.")
        
        # Generate OAuth URL for Google Fit only
        base = _get_public_backend_base(request)
        callback_url = f"{base}auth/google/callback"
        # Store the user ID and connection intent in session for the callback
        request.session["connecting_user_id"] = str(user_id)
        request.session["connection_intent"] = "health_service"
        redirect_resp = await oauth.google.authorize_redirect(
            request,
            callback_url,
            prompt="consent",
            access_type="offline",
            include_granted_scopes="true"
        )
        redirect_url = redirect_resp.headers.get("location")
        
        if not redirect_url:
            raise HTTPException(status_code=500, detail="Failed to generate OAuth redirect URL")
        return {"redirect_url": str(redirect_url)}
        
    except Exception as e:
        logger.error(f"Error in connect_health_service: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate health service connection: {str(e)}")

