# app/routers/assessment_ai.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/ai/assessment", tags=["AI Assessment"])

# ====== Request Schema ======
class OnboardingData(BaseModel):
    gender: str
    date_of_birth: str
    weight: str  # Changed to str to handle various formats
    height: str  # Changed to str to handle various formats
    activity_level: str
    medical_conditions: list
    fitness_goals: list  # Changed to match our data structure
    time_available: str
    preferred_workout_type: str
    other_medical_condition: str = ""
    custom_goal: str = ""

# ====== Response Schema ======
class AIResponse(BaseModel):
    time_to_goal: str
    motivational_message: str
    health_score: int
    risk_profile: list
    predicted_calories: int  # AI-predicted daily calorie needs

# ====== Groq Client Setup ======
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# GROQ_MODEL = os.getenv("GROQ_MODEL")
GROQ_MODEL = "llama-3.3-70b-versatile"

client = None
if GROQ_API_KEY:
    try:
        client = Groq(api_key=GROQ_API_KEY)
        print("Assessment AI: Groq client initialized successfully")
    except Exception as e:
        print(f"Assessment AI: Failed to initialize Groq client: {e}")
        client = None
else:
    print("Assessment AI: GROQ_API_KEY not set. AI features will be disabled.")

@router.post("/", response_model=AIResponse)
def generate_ai_assessment(data: OnboardingData):
    try:
        # Process fitness goals
        goals = ", ".join(data.fitness_goals) if data.fitness_goals else "General fitness"
        if data.custom_goal:
            goals += f", {data.custom_goal}"
            
        # Process medical conditions
        conditions = data.medical_conditions.copy() if data.medical_conditions else []
        if data.other_medical_condition:
            conditions.append(data.other_medical_condition)
        conditions_str = ", ".join(conditions) if conditions else "None"

        # Calculate age for better assessment
        from datetime import datetime
        try:
            if data.date_of_birth:
                birth_date = datetime.strptime(data.date_of_birth, "%Y-%m-%d")
                age = datetime.now().year - birth_date.year
                if datetime.now().month < birth_date.month or (datetime.now().month == birth_date.month and datetime.now().day < birth_date.day):
                    age -= 1
            else:
                age = 25  # Default age if not provided
        except:
            age = 25  # Default age if date parsing fails

        # Combine inputs into one prompt
        prompt = f"""
        You are a professional AI health and fitness coach. Analyze this user's profile and provide a realistic assessment:

        Profile:
        - Age: {age} years
        - Gender: {data.gender}
        - Weight: {data.weight}
        - Height: {data.height}
        - Current Activity Level: {data.activity_level}
        - Medical Conditions: {conditions_str}
        - Fitness Goals: {goals}
        - Available Time: {data.time_available} minutes per day
        - Preferred Workout: {data.preferred_workout_type}

        Provide your assessment in this exact JSON format:
        {{
          "time_to_goal": "realistic timeframe (e.g., '8-12 weeks', '3-6 months')",
          "motivational_message": "inspiring message under 50 words",
          "health_score": integer_between_0_and_100,
          "risk_profile": ["list", "of", "health considerations or risks"],
          "predicted_calories": integer_daily_calorie_recommendation
        }}

        IMPORTANT for predicted_calories:
        - Calculate personalized daily calorie needs based on their age, gender, weight, height, and activity level
        - Consider their fitness goals (weight loss: deficit of 300-500 cal, muscle gain: surplus of 200-400 cal, maintenance: TDEE)
        - Use proper formulas (Mifflin-St Jeor for BMR, then multiply by activity factor)
        - Ensure the value is realistic and safe (typically 1200-4000 kcal for most adults)
        - Account for medical conditions if they affect metabolism
        
        Consider their age, activity level, available time, and medical conditions when determining the health score and timeline. Be encouraging but realistic.
        """

        if not client:
            raise HTTPException(500, "AI service not available. Please check your GROQ configuration.")
            
        response = client.chat.completions.create(
            model=GROQ_MODEL,  # Use the configured model
            messages=[
                {"role": "system", "content": "You are a professional AI health and fitness coach. Always respond with valid, complete JSON only. Do not include any markdown formatting, code blocks, or extra text. Ensure all strings are properly terminated and all fields are included."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,  # Reduced for more consistent output
            max_tokens=800,  # Increased to ensure complete responses
            response_format={"type": "json_object"}  # Force JSON output
        )

        import json
        import re
        
        # Get the response content
        ai_content = response.choices[0].message.content.strip()
        
        # Clean up the response - remove any markdown code blocks or extra formatting
        ai_content = re.sub(r'```json\s*', '', ai_content)
        ai_content = re.sub(r'```\s*$', '', ai_content)
        ai_content = ai_content.strip()
        
        # Try to fix common JSON issues
        # Fix unterminated strings by finding the last complete quote
        if ai_content and not ai_content.endswith('}'):
            # Try to close incomplete JSON
            last_brace = ai_content.rfind('}')
            if last_brace > 0:
                ai_content = ai_content[:last_brace + 1]
        
        try:
            ai_output = json.loads(ai_content)
        except json.JSONDecodeError as json_error:
            # If JSON parsing fails, provide a fallback response
            print(f"JSON parsing failed: {json_error}")
            print(f"AI Response content (first 500 chars): {ai_content[:500]}")
            
            # Try to extract partial data if possible
            partial_data = {}
            try:
                # Attempt to extract time_to_goal
                time_match = re.search(r'"time_to_goal"\s*:\s*"([^"]*)"', ai_content)
                if time_match:
                    partial_data["time_to_goal"] = time_match.group(1)
                
                # Attempt to extract health_score
                score_match = re.search(r'"health_score"\s*:\s*(\d+)', ai_content)
                if score_match:
                    partial_data["health_score"] = int(score_match.group(1))
                
                # Attempt to extract predicted_calories
                cal_match = re.search(r'"predicted_calories"\s*:\s*(\d+)', ai_content)
                if cal_match:
                    partial_data["predicted_calories"] = int(cal_match.group(1))
            except Exception as extract_error:
                print(f"Failed to extract partial data: {extract_error}")
            
            # Create a fallback response based on the user's data
            # Calculate fallback calories using Mifflin-St Jeor equation
            fallback_calories = _calculate_fallback_calories(data, age)
            
            fallback_response = {
                "time_to_goal": partial_data.get("time_to_goal", "8-12 weeks"),
                "motivational_message": "Your fitness journey starts with a single step. Stay consistent and you'll achieve your goals!",
                "health_score": partial_data.get("health_score", 75),
                "risk_profile": ["Consult with a healthcare provider before starting any new exercise program"],
                "predicted_calories": partial_data.get("predicted_calories", fallback_calories)
            }
            ai_output = fallback_response

        # Validate the response has all required fields
        required_fields = ["time_to_goal", "motivational_message", "health_score", "risk_profile", "predicted_calories"]
        for field in required_fields:
            if field not in ai_output:
                if field == "risk_profile":
                    ai_output[field] = []
                elif field == "health_score":
                    ai_output[field] = 75
                elif field == "predicted_calories":
                    ai_output[field] = _calculate_fallback_calories(data, age)
                else:
                    ai_output[field] = "Not available"

        # Ensure health_score is an integer between 0-100
        if not isinstance(ai_output["health_score"], int) or ai_output["health_score"] < 0 or ai_output["health_score"] > 100:
            ai_output["health_score"] = 75

        # Ensure risk_profile is a list
        if not isinstance(ai_output["risk_profile"], list):
            ai_output["risk_profile"] = []
        
        # Ensure predicted_calories is a valid integer
        if not isinstance(ai_output["predicted_calories"], int) or ai_output["predicted_calories"] < 1200 or ai_output["predicted_calories"] > 5000:
            ai_output["predicted_calories"] = _calculate_fallback_calories(data, age)

        return AIResponse(**ai_output)

    except Exception as e:
        print(f"AI Assessment error: {e}")
        # Return a safe fallback response instead of raising an exception
        # Try to calculate calories even in error state
        try:
            fallback_calories = _calculate_fallback_calories(data, 25)
        except:
            fallback_calories = 2000  # Safe default
            
        fallback_response = AIResponse(
            time_to_goal="8-12 weeks",
            motivational_message="Your fitness journey is unique. Stay consistent and listen to your body!",
            health_score=75,
            risk_profile=["Consult with a healthcare provider before starting any new exercise program"],
            predicted_calories=fallback_calories
        )
        return fallback_response


def _calculate_fallback_calories(data: OnboardingData, age: int) -> int:
    """
    Calculate fallback calories using Mifflin-St Jeor equation when AI fails
    """
    try:
        # Parse weight to kg
        weight_str = str(data.weight).lower()
        if 'lb' in weight_str or 'pound' in weight_str:
            weight_kg = float(''.join(filter(str.isdigit or '.'.__eq__, weight_str.split('lb')[0]))) * 0.453592
        elif 'kg' in weight_str:
            weight_kg = float(''.join(filter(str.isdigit or '.'.__eq__, weight_str.split('kg')[0])))
        else:
            weight_kg = float(''.join(filter(str.isdigit or '.'.__eq__, weight_str)))
        
        # Parse height to cm
        height_str = str(data.height).lower()
        if 'cm' in height_str:
            height_cm = float(''.join(filter(str.isdigit or '.'.__eq__, height_str.split('cm')[0])))
        elif "'" in height_str or 'ft' in height_str:
            # Handle feet and inches (e.g., "5'10" or "5 ft 10 in")
            parts = height_str.replace('ft', "'").replace('in', '"').replace(' ', '')
            if "'" in parts:
                feet_inches = parts.split("'")
                feet = float(feet_inches[0])
                inches = float(feet_inches[1].replace('"', '')) if len(feet_inches) > 1 and feet_inches[1].replace('"', '') else 0
                height_cm = (feet * 12 + inches) * 2.54
            else:
                height_cm = 170  # Default
        else:
            height_cm = float(''.join(filter(str.isdigit or '.'.__eq__, height_str)))
            if height_cm < 3:  # Probably in meters
                height_cm *= 100
        
        # Calculate BMR using Mifflin-St Jeor equation
        gender = data.gender.lower()
        if 'male' in gender and 'female' not in gender:
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        else:  # female or unknown
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
        
        # Apply activity factor
        activity_level = data.activity_level.lower()
        if 'sedentary' in activity_level:
            activity_factor = 1.2
        elif 'lightly' in activity_level or 'light' in activity_level:
            activity_factor = 1.375
        elif 'moderately' in activity_level or 'moderate' in activity_level:
            activity_factor = 1.55
        elif 'very' in activity_level or 'intense' in activity_level:
            activity_factor = 1.725
        elif 'extra' in activity_level or 'athlete' in activity_level:
            activity_factor = 1.9
        else:
            activity_factor = 1.2  # Default to sedentary
        
        tdee = int(bmr * activity_factor)
        
        # Adjust based on fitness goals
        goals_str = ' '.join(data.fitness_goals).lower()
        if 'weight loss' in goals_str or 'lose weight' in goals_str or 'fat loss' in goals_str:
            # Create a deficit (300-500 calories)
            tdee = tdee - 400
        elif 'muscle' in goals_str or 'bulk' in goals_str or 'gain weight' in goals_str:
            # Create a surplus (200-400 calories)
            tdee = tdee + 300
        # else: maintenance (keep TDEE as is)
        
        # Ensure within safe range
        tdee = max(1200, min(5000, tdee))
        
        return tdee
    
    except Exception as e:
        print(f"Error calculating fallback calories: {e}")
        return 2000  # Safe default


