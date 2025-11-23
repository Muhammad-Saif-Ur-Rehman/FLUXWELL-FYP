# app/services/user_profile_service.py
"""
User Profile Service for Chat Personalization
Integrates user onboarding and workout profiles into the chat memory system
"""

import logging
from typing import Dict, Any, Optional, List
from bson import ObjectId
from datetime import datetime, timezone

from app.database.connection import db
from app.models.user import OnboardingStep1, OnboardingStep2, AIAssessmentResult
from app.models.workout_profile import WorkoutProfileOut

logger = logging.getLogger(__name__)

class UserProfileService:
    """Service for managing user profiles and integrating them with chat memory"""
    
    @staticmethod
    async def get_user_onboarding_profile(user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's onboarding profile data"""
        try:
            user_doc = db.users.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                logger.warning(f"User not found: {user_id}")
                return None
            
            onboarding_data = user_doc.get("onboarding", {})
            if not onboarding_data:
                logger.info(f"No onboarding data found for user: {user_id}")
                return None
            
            return onboarding_data
            
        except Exception as e:
            logger.error(f"Error fetching onboarding profile for user {user_id}: {e}")
            return None
    
    @staticmethod
    async def get_user_workout_profile(user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's workout profile data"""
        try:
            workout_doc = db.workout_profiles.find_one({"user_id": ObjectId(user_id)})
            if not workout_doc:
                logger.info(f"No workout profile found for user: {user_id}")
                return None
            
            # Convert ObjectIds to strings for JSON serialization
            workout_doc["_id"] = str(workout_doc["_id"])
            workout_doc["user_id"] = str(workout_doc["user_id"])
            
            return workout_doc
            
        except Exception as e:
            logger.error(f"Error fetching workout profile for user {user_id}: {e}")
            return None
    
    @staticmethod
    async def get_user_nutrition_profile(user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's nutrition profile data"""
        try:
            nutrition_doc = db.nutrition_profiles.find_one({"user_id": ObjectId(user_id)})
            if not nutrition_doc:
                logger.info(f"No nutrition profile found for user: {user_id}")
                return None
            
            # Convert ObjectIds to strings for JSON serialization
            nutrition_doc["_id"] = str(nutrition_doc["_id"])
            nutrition_doc["user_id"] = str(nutrition_doc["user_id"])
            
            return nutrition_doc
            
        except Exception as e:
            logger.error(f"Error fetching nutrition profile for user {user_id}: {e}")
            return None
    
    @staticmethod
    async def get_comprehensive_user_profile(user_id: str) -> Dict[str, Any]:
        """Get comprehensive user profile combining onboarding, workout, and nutrition data"""
        try:
            # Get all profiles in parallel
            import asyncio
            onboarding_task = UserProfileService.get_user_onboarding_profile(user_id)
            workout_task = UserProfileService.get_user_workout_profile(user_id)
            nutrition_task = UserProfileService.get_user_nutrition_profile(user_id)
            
            onboarding_data, workout_data, nutrition_data = await asyncio.gather(
                onboarding_task, workout_task, nutrition_task, return_exceptions=True
            )
            
            # Handle exceptions
            if isinstance(onboarding_data, Exception):
                logger.error(f"Onboarding data fetch failed: {onboarding_data}")
                onboarding_data = None
            
            if isinstance(workout_data, Exception):
                logger.error(f"Workout data fetch failed: {workout_data}")
                workout_data = None
            
            if isinstance(nutrition_data, Exception):
                logger.error(f"Nutrition data fetch failed: {nutrition_data}")
                nutrition_data = None
            
            # Build comprehensive profile
            profile = {
                "user_id": user_id,
                "has_onboarding": bool(onboarding_data),
                "has_workout_profile": bool(workout_data),
                "has_nutrition_profile": bool(nutrition_data),
                "onboarding": onboarding_data,
                "workout_profile": workout_data,
                "nutrition_profile": nutrition_data,
                "profile_completeness": UserProfileService._calculate_profile_completeness(onboarding_data, workout_data, nutrition_data),
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
            
            return profile
            
        except Exception as e:
            logger.error(f"Error building comprehensive profile for user {user_id}: {e}")
            return {
                "user_id": user_id,
                "has_onboarding": False,
                "has_workout_profile": False,
                "onboarding": None,
                "workout_profile": None,
                "profile_completeness": 0,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "error": str(e)
            }
    
    @staticmethod
    def _calculate_profile_completeness(onboarding_data: Optional[Dict], workout_data: Optional[Dict], nutrition_data: Optional[Dict] = None) -> int:
        """Calculate profile completeness percentage"""
        completeness = 0
        
        if onboarding_data:
            step1 = onboarding_data.get("step1", {})
            step2 = onboarding_data.get("step2", {})
            
            # Check step1 completeness (basic info)
            step1_fields = ["gender", "date_of_birth", "weight", "height"]
            step1_complete = sum(1 for field in step1_fields if step1.get(field))
            
            # Check step2 completeness (fitness info)
            step2_fields = ["activity_level", "fitness_goals", "time_available", "preferred_workout_type"]
            step2_complete = sum(1 for field in step2_fields if step2.get(field))
            
            # Onboarding contributes 50% of completeness
            onboarding_score = (step1_complete + step2_complete) / (len(step1_fields) + len(step2_fields))
            completeness += onboarding_score * 50
        
        if workout_data:
            # Workout profile contributes 25% of completeness
            workout_fields = ["location", "equipment", "style_preferences", "experience_level", "daily_minutes"]
            workout_complete = sum(1 for field in workout_fields if workout_data.get(field))
            workout_score = workout_complete / len(workout_fields)
            completeness += workout_score * 25
        
        if nutrition_data:
            # Nutrition profile contributes 25% of completeness
            nutrition_fields = ["diet_type", "meals_per_day", "allergies", "favorite_cuisines"]
            nutrition_complete = sum(1 for field in nutrition_fields if nutrition_data.get(field))
            nutrition_score = nutrition_complete / len(nutrition_fields)
            completeness += nutrition_score * 25
        
        return int(completeness)
    
    @staticmethod
    def build_personalization_context(profile_data: Dict[str, Any]) -> str:
        """Build personalized context string for the coach"""
        if not profile_data or not (profile_data.get("has_onboarding") or profile_data.get("has_workout_profile")):
            return ""
        
        context_parts = []
        
        # User Profile Header
        context_parts.append("=== USER PROFILE & PERSONALIZATION DATA ===")
        context_parts.append(f"Profile Completeness: {profile_data.get('profile_completeness', 0)}%")
        
        # Onboarding Information
        onboarding = profile_data.get("onboarding")
        if onboarding:
            context_parts.append("\n--- PERSONAL INFORMATION ---")
            
            # Step 1: Basic Info
            step1 = onboarding.get("step1", {})
            if step1:
                if step1.get("gender"):
                    context_parts.append(f"• Gender: {step1['gender']}")
                if step1.get("date_of_birth"):
                    context_parts.append(f"• Age: {UserProfileService._calculate_age(step1['date_of_birth'])}")
                if step1.get("weight"):
                    context_parts.append(f"• Weight: {step1['weight']}")
                if step1.get("height"):
                    context_parts.append(f"• Height: {step1['height']}")
            
            # Step 2: Fitness Info
            step2 = onboarding.get("step2", {})
            if step2:
                context_parts.append("\n--- FITNESS BACKGROUND ---")
                if step2.get("activity_level"):
                    context_parts.append(f"• Activity Level: {step2['activity_level']}")
                if step2.get("fitness_goals"):
                    goals_str = ", ".join(step2["fitness_goals"])
                    context_parts.append(f"• Fitness Goals: {goals_str}")
                if step2.get("time_available"):
                    context_parts.append(f"• Available Time: {step2['time_available']}")
                if step2.get("preferred_workout_type"):
                    context_parts.append(f"• Preferred Workout: {step2['preferred_workout_type']}")
                if step2.get("medical_conditions") and step2["medical_conditions"]:
                    conditions_str = ", ".join(step2["medical_conditions"])
                    context_parts.append(f"• Medical Considerations: {conditions_str}")
                if step2.get("custom_goal"):
                    context_parts.append(f"• Custom Goal: {step2['custom_goal']}")
            
            # AI Assessment
            ai_assessment = onboarding.get("ai_assessment")
            if ai_assessment:
                context_parts.append("\n--- AI ASSESSMENT RESULTS ---")
                if ai_assessment.get("time_to_goal"):
                    context_parts.append(f"• Estimated Time to Goal: {ai_assessment['time_to_goal']}")
                if ai_assessment.get("health_score"):
                    context_parts.append(f"• Health Score: {ai_assessment['health_score']}/100")
                if ai_assessment.get("risk_profile"):
                    risks_str = ", ".join(ai_assessment["risk_profile"])
                    context_parts.append(f"• Risk Profile: {risks_str}")
                if ai_assessment.get("motivational_message"):
                    context_parts.append(f"• Motivation: {ai_assessment['motivational_message']}")
        
        # Workout Profile Information
        workout_profile = profile_data.get("workout_profile")
        if workout_profile:
            context_parts.append("\n--- WORKOUT PREFERENCES ---")
            if workout_profile.get("location"):
                context_parts.append(f"• Workout Location: {workout_profile['location']}")
            if workout_profile.get("equipment"):
                equipment_str = ", ".join(workout_profile["equipment"])
                context_parts.append(f"• Available Equipment: {equipment_str}")
            if workout_profile.get("outdoor_activities"):
                outdoor_str = ", ".join(workout_profile["outdoor_activities"])
                context_parts.append(f"• Outdoor Activities: {outdoor_str}")
            if workout_profile.get("style_preferences"):
                styles_str = ", ".join(workout_profile["style_preferences"])
                context_parts.append(f"• Workout Styles: {styles_str}")
            if workout_profile.get("experience_level"):
                context_parts.append(f"• Experience Level: {workout_profile['experience_level']}")
            if workout_profile.get("daily_minutes"):
                context_parts.append(f"• Daily Workout Time: {workout_profile['daily_minutes']} minutes")
            if workout_profile.get("custom_equipment"):
                custom_str = ", ".join(workout_profile["custom_equipment"])
                context_parts.append(f"• Custom Equipment: {custom_str}")
        
        # Nutrition Profile Information
        nutrition_profile = profile_data.get("nutrition_profile")
        if nutrition_profile:
            context_parts.append("\n--- NUTRITION PREFERENCES ---")
            if nutrition_profile.get("diet_type"):
                context_parts.append(f"• Diet Type: {nutrition_profile['diet_type']}")
            if nutrition_profile.get("meals_per_day"):
                context_parts.append(f"• Meals Per Day: {nutrition_profile['meals_per_day']}")
            if nutrition_profile.get("snacks_per_day"):
                context_parts.append(f"• Snacks Per Day: {nutrition_profile['snacks_per_day']}")
            if nutrition_profile.get("allergies"):
                allergies_str = ", ".join(nutrition_profile["allergies"]) if isinstance(nutrition_profile["allergies"], list) else nutrition_profile["allergies"]
                context_parts.append(f"• Allergies: {allergies_str}")
            if nutrition_profile.get("disliked_foods"):
                context_parts.append(f"• Dislikes: {nutrition_profile['disliked_foods']}")
            if nutrition_profile.get("favorite_cuisines"):
                cuisines_str = ", ".join(nutrition_profile["favorite_cuisines"]) if isinstance(nutrition_profile["favorite_cuisines"], list) else nutrition_profile["favorite_cuisines"]
                context_parts.append(f"• Favorite Cuisines: {cuisines_str}")
            if nutrition_profile.get("cooking_time"):
                context_parts.append(f"• Cooking Time Preference: {nutrition_profile['cooking_time']}")
            if nutrition_profile.get("cooking_experience"):
                context_parts.append(f"• Cooking Experience: {nutrition_profile['cooking_experience']}")
        
        # Personalization Instructions
        if context_parts:
            context_parts.append("\n--- COACHING INSTRUCTIONS ---")
            context_parts.append("• Use this profile data to provide HIGHLY PERSONALIZED responses")
            context_parts.append("• Reference their specific goals, preferences, and limitations")
            context_parts.append("• Adapt workout suggestions to their equipment and location")
            context_parts.append("• Consider their experience level and available time")
            context_parts.append("• Be mindful of any medical conditions or risk factors")
            context_parts.append("• For nutrition questions, respect their diet type, allergies, and food preferences")
            context_parts.append("• Suggest meals that match their cooking time and experience level")
            context_parts.append("• Build on their existing fitness and nutrition journey")
        
        return "\n".join(context_parts) if context_parts else ""
    
    @staticmethod
    def _calculate_age(date_of_birth: str) -> str:
        """Calculate age from date of birth string"""
        try:
            from datetime import datetime
            
            # Handle None or empty values
            if not date_of_birth or date_of_birth.strip() == "":
                return "Age not provided"
            
            if "-" in date_of_birth:  # YYYY-MM-DD format
                birth_date = datetime.strptime(date_of_birth, "%Y-%m-%d")
            elif "/" in date_of_birth:  # MM/DD/YYYY or DD/MM/YYYY format
                # Try both formats
                try:
                    birth_date = datetime.strptime(date_of_birth, "%m/%d/%Y")
                except ValueError:
                    birth_date = datetime.strptime(date_of_birth, "%d/%m/%Y")
            else:
                return date_of_birth  # Return as-is if format unknown
            
            today = datetime.now()
            age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
            return f"{age} years old"
            
        except Exception as e:
            logger.warning(f"Could not calculate age from {date_of_birth}: {e}")
            return str(date_of_birth) if date_of_birth else "Age not provided"
    
    @staticmethod
    async def get_user_personalization_summary(user_id: str) -> Dict[str, Any]:
        """Get a summary of user data for quick personalization"""
        try:
            profile = await UserProfileService.get_comprehensive_user_profile(user_id)
            
            summary = {
                "user_id": user_id,
                "has_profile_data": profile.get("has_onboarding") or profile.get("has_workout_profile"),
                "completeness": profile.get("profile_completeness", 0),
                "quick_facts": [],
                "coaching_focus": [],
                "limitations": []
            }
            
            # Extract quick facts
            onboarding = profile.get("onboarding", {})
            workout_profile = profile.get("workout_profile", {})
            
            if onboarding:
                step1 = onboarding.get("step1", {})
                step2 = onboarding.get("step2", {})
                
                # Quick facts from onboarding
                if step2.get("fitness_goals"):
                    summary["quick_facts"].append(f"Goals: {', '.join(step2['fitness_goals'])}")
                if step2.get("activity_level"):
                    summary["quick_facts"].append(f"Activity: {step2['activity_level']}")
                if step2.get("time_available"):
                    summary["quick_facts"].append(f"Time: {step2['time_available']}")
                
                # Medical limitations
                if step2.get("medical_conditions") and step2["medical_conditions"]:
                    summary["limitations"].extend(step2["medical_conditions"])
            
            if workout_profile:
                # Quick facts from workout profile
                if workout_profile.get("experience_level"):
                    summary["quick_facts"].append(f"Experience: {workout_profile['experience_level']}")
                if workout_profile.get("location"):
                    summary["quick_facts"].append(f"Location: {workout_profile['location']}")
                if workout_profile.get("daily_minutes"):
                    summary["quick_facts"].append(f"Duration: {workout_profile['daily_minutes']}min")
            
            # Determine coaching focus
            if summary["completeness"] < 30:
                summary["coaching_focus"].append("Profile completion guidance")
            if summary["completeness"] >= 30:
                summary["coaching_focus"].append("Personalized workout planning")
            if summary["limitations"]:
                summary["coaching_focus"].append("Safety-first approach")
            
            return summary
            
        except Exception as e:
            logger.error(f"Error creating personalization summary for user {user_id}: {e}")
            return {
                "user_id": user_id,
                "has_profile_data": False,
                "completeness": 0,
                "quick_facts": [],
                "coaching_focus": ["General fitness guidance"],
                "limitations": [],
                "error": str(e)
            }
