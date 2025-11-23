from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class OnboardingStep1(BaseModel):
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    weight: Optional[str] = None
    height: Optional[str] = None
    profile_picture_url: Optional[str] = None

class OnboardingStep2(BaseModel):
    activity_level: Optional[str] = None
    medical_conditions: Optional[List[str]] = Field(default_factory=list)
    fitness_goals: Optional[List[str]] = Field(default_factory=list)
    time_available: Optional[str] = None
    preferred_workout_type: Optional[str] = None
    other_medical_condition: Optional[str] = None
    custom_goal: Optional[str] = None

class OnboardingNutrition(BaseModel):
    # Dietary preferences
    diet_type: Optional[str] = None  # Balanced, Low Carb, Vegetarian, Vegan, Keto, Paleo, Custom
    allergies: Optional[List[str]] = Field(default_factory=list)  # e.g., Dairy, Gluten, Nuts, Soy, Shellfish, Eggs, + custom
    disliked_foods: Optional[str] = None  # free-text textarea

    # Cuisine preferences
    favorite_cuisines: Optional[List[str]] = Field(default_factory=list)  # e.g., Italian, Mexican, Indian, Chinese, Japanese, Mediterranean, Custom

    # Meal structure
    meals_per_day: Optional[int] = None
    snacks_per_day: Optional[int] = None

    # Other preferences
    cooking_time_preference: Optional[str] = None  # Quick (15-30m), Moderate (30-60m), Leisurely (60+m)

class AIAssessmentResult(BaseModel):
    time_to_goal: str
    motivational_message: str
    health_score: int
    risk_profile: List[str]
    predicted_calories: int  # AI-predicted daily calorie needs
    generated_at: Optional[datetime] = None

class OnboardingData(BaseModel):
    step1: Optional[OnboardingStep1] = None
    step2: Optional[OnboardingStep2] = None
    nutrition: Optional[OnboardingNutrition] = None
    ai_assessment: Optional[AIAssessmentResult] = None
    completed: bool = False
    completed_at: Optional[datetime] = None

class SocialAuthData(BaseModel):
    """Data from social authentication providers"""
    google: Optional[dict] = None
    fitbit: Optional[dict] = None
    
    class Config:
        extra = "allow"  # Allow additional fields from social providers

class UserProfile(BaseModel):
    """Complete user profile model"""
    id: Optional[str] = None
    full_name: str
    email: EmailStr
    auth_provider: str  # 'form', 'google', 'fitbit'
    password: Optional[str] = None  # Only for form registration
    
    # Basic info that might come from social auth
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    profile_picture_url: Optional[str] = None
    
    # Social auth data
    social_auth_data: Optional[SocialAuthData] = None
    
    # Onboarding data
    onboarding: Optional[OnboardingData] = None
    onboarding_completed: bool = False
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None

class UserResponse(BaseModel):
    """User response model for API"""
    id: str
    full_name: str
    email: str
    auth_provider: str
    profile_picture_url: Optional[str] = None
    onboarding_completed: bool = False
    created_at: datetime

class OnboardingUpdateRequest(BaseModel):
    """Request model for updating onboarding data"""
    step1: Optional[OnboardingStep1] = None
    step2: Optional[OnboardingStep2] = None
    nutrition: Optional[OnboardingNutrition] = None
    complete: bool = False

class OnboardingDataResponse(BaseModel):
    """Response model for onboarding data with merged social auth data"""
    step1: OnboardingStep1
    step2: OnboardingStep2
    nutrition: Optional[OnboardingNutrition] = None
    completed: bool
    onboarding_completed: bool
    has_social_data: bool = False
    social_provider: Optional[str] = None
