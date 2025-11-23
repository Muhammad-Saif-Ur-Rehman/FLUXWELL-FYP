# app/routers/goal_feasibility_ai.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from groq import Groq
from dotenv import load_dotenv
import re

load_dotenv()

router = APIRouter(prefix="/ai/goal-feasibility", tags=["AI Goal Feasibility"])

# ====== Utility Functions ======
def convert_height_to_cm(height_input):
    """
    Convert height from various formats to centimeters.
    Handles: feet'inches" (e.g., "6'3""), feet.inches (e.g., 6.3), or direct cm values
    """
    if isinstance(height_input, (int, float)):
        # If it's already a number, assume it's in feet (e.g., 6.3 means 6'3")
        if height_input < 10:  # Likely feet format
            feet = int(height_input)
            inches = int((height_input - feet) * 12)
            return feet * 30.48 + inches * 2.54
        else:  # Likely already in cm
            return height_input
    
    if isinstance(height_input, str):
        # Handle feet'inches" format (e.g., "6'3"")
        # More robust regex to handle various quote formats
        feet_inches_match = re.match(r"(\d+)'(\d+)\"", height_input)
        if feet_inches_match:
            feet = int(feet_inches_match.group(1))
            inches = int(feet_inches_match.group(2))
            return feet * 30.48 + inches * 2.54
        
        # Handle feet.inches format (e.g., "6.3" meaning 6'3")
        if '.' in height_input:
            try:
                height_float = float(height_input)
                if height_float < 10:  # Likely feet format
                    feet = int(height_float)
                    inches = int((height_float - feet) * 12)
                    return feet * 30.48 + inches * 2.54
            except ValueError:
                pass
        
        # Try to parse as direct number (cm)
        try:
            height_num = float(height_input)
            if height_num < 10:  # Likely feet format
                feet = int(height_num)
                inches = int((height_num - feet) * 12)
                return feet * 30.48 + inches * 2.54
            else:  # Likely already in cm
                return height_num
        except ValueError:
            pass
    
    # Default fallback - assume it's already in cm
    return height_input

# ====== Request Schema ======
class GoalRequest(BaseModel):
    gender: str
    date_of_birth: str
    weight: float
    height: str  # Can be feet'inches" format (e.g., "6'3"") or cm as string
    activity_level: str
    medical_conditions: list
    selected_goal: str
    custom_goal: str = None

# ====== Response Schema ======
class GoalResponse(BaseModel):
    feasible: bool
    reason: str
    recommended_goal: str

# ====== Groq Client ======
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL")

client = None
if GROQ_API_KEY:
    try:
        client = Groq(api_key=GROQ_API_KEY)
        print("Goal Feasibility AI: Groq client initialized successfully")
    except Exception as e:
        print(f"Goal Feasibility AI: Failed to initialize Groq client: {e}")
        client = None
else:
    print("Goal Feasibility AI: GROQ_API_KEY not set. AI features will be disabled.")

@router.post("/", response_model=GoalResponse)
def check_goal_feasibility(data: GoalRequest):
    try:
        # Calculate age from date of birth
        from datetime import datetime
        birth_date = datetime.strptime(data.date_of_birth, "%Y-%m-%d")
        age = (datetime.now() - birth_date).days // 365
        
        # Convert height to centimeters and calculate BMI
        print(f"DEBUG: Original height input: {data.height} (type: {type(data.height)})")
        height_cm = convert_height_to_cm(data.height)
        print(f"DEBUG: Converted height to cm: {height_cm}")
        height_m = height_cm / 100
        bmi = data.weight / (height_m ** 2)
        
        prompt = f"""ASSESS FITNESS GOAL FEASIBILITY

USER DATA:
Gender: {data.gender}
Age: {age} years
Weight: {data.weight} kg
Height: {height_cm:.1f} cm
BMI: {bmi:.1f} ({'Underweight' if bmi < 18.5 else 'Normal' if bmi < 25 else 'Overweight' if bmi < 30 else 'Obese'})
Activity: {data.activity_level}
Medical: {", ".join(data.medical_conditions) if data.medical_conditions else "None"}
Goal: {data.selected_goal if data.selected_goal != "Custom" else data.custom_goal}

INSTRUCTIONS:
1. Assess if the goal is SAFE and ACHIEVABLE
2. Consider: age, BMI, medical conditions, activity level
3. Be CONSERVATIVE - if unsure, mark as not feasible
4. If not feasible, suggest a different goal

RESPOND WITH JSON ONLY:
{{
  "feasible": true/false,
  "reason": "explanation",
  "recommended_goal": "Lose Weight|Gain Muscle|Improve Endurance|Maintain Health"
}}

SAFETY RULES:
- BMI < 18.5 or > 35 = be very cautious
- Age < 16 or > 65 = consider modifications
- Medical conditions = prioritize safety
- Sedentary activity = start conservative"""

        if not client:
            raise HTTPException(500, "AI service not available. Please check your GROQ configuration.")

        response = client.chat.completions.create(
            model=GROQ_MODEL,  # Use the configured model
            messages=[
                {"role": "system", "content": "You are a fitness expert. Respond with ONLY valid JSON. Use 'feasible', 'reason', and 'recommended_goal' keys. Prioritize safety. Be conservative."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )

        import json
        # Clean the response to ensure it's valid JSON
        content = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if content.startswith('```'):
            content = content.split('```')[1]
            if content.startswith('json'):
                content = content[4:]
        
        # Try to parse the JSON, with fallback handling
        try:
            ai_output = json.loads(content)
        except json.JSONDecodeError:
            # If JSON parsing fails, try to extract JSON from the response
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                try:
                    ai_output = json.loads(json_match.group())
                except json.JSONDecodeError:
                    raise ValueError("Unable to parse AI response as valid JSON")
            else:
                raise ValueError("No JSON content found in AI response")
        
        # Debug logging for AI response
        print(f"DEBUG: AI Response - feasible: {ai_output.get('feasible')}, recommended: {ai_output.get('recommended_goal')}")
        
        # Validate and clean the AI response
        required_fields = ['feasible', 'reason', 'recommended_goal']
        for field in required_fields:
            if field not in ai_output:
                ai_output[field] = ''
                
        # Ensure feasible is boolean
        if not isinstance(ai_output.get('feasible'), bool):
            ai_output['feasible'] = False
            
        # Ensure recommended_goal is always one of the valid options
        valid_goals = ["Lose Weight", "Gain Muscle", "Improve Endurance", "Maintain Health"]
        if ai_output.get('recommended_goal') not in valid_goals:
            ai_output['recommended_goal'] = 'Maintain Health'
            
        # CRITICAL: If goal is not feasible, ensure recommended_goal is different
        if not ai_output.get('feasible', False):
            selected_goal = data.selected_goal if data.selected_goal != "Custom" else data.custom_goal
            recommended_goal = ai_output.get('recommended_goal', '')
            
            # If the recommended goal is the same as the selected goal, fix it
            if recommended_goal.lower() == selected_goal.lower():
                # Choose a safe alternative based on the selected goal
                safe_alternatives = {
                    'lose weight': 'Maintain Health',
                    'gain muscle': 'Improve Endurance', 
                    'improve endurance': 'Maintain Health',
                    'maintain health': 'Improve Endurance'
                }
                
                # Find a safe alternative
                for goal_key, alternative in safe_alternatives.items():
                    if goal_key in selected_goal.lower():
                        ai_output['recommended_goal'] = alternative
                        break
                else:
                    # Default safe alternative
                    ai_output['recommended_goal'] = 'Maintain Health'
                    
                # Update reason to explain the change
                ai_output['reason'] = f"Goal '{selected_goal}' is not feasible for your current health profile. {ai_output['reason']} I've recommended '{ai_output['recommended_goal']}' as a safer alternative."
        
        # Final debug logging
        print(f"DEBUG: Final Response - feasible: {ai_output.get('feasible')}, recommended: {ai_output.get('recommended_goal')}")
            
        return GoalResponse(**ai_output)

    except (json.JSONDecodeError, ValueError) as e:
        print(f"JSON parsing error: {e}")
        # Fallback response if AI returns invalid JSON - err on side of caution
        return GoalResponse(
            feasible=False,
            reason="Unable to assess goal feasibility at this time. For your safety, please consult with a qualified fitness professional or healthcare provider before starting any new fitness program.",
            recommended_goal="Maintain Health"
        )
    except Exception as e:
        print(f"Goal feasibility error: {e}")
        # Fallback response for any other errors - prioritize safety
        return GoalResponse(
            feasible=False,
            reason="Goal assessment system temporarily unavailable. For your safety, we recommend consulting with a fitness professional before starting your fitness journey. Your health and safety are our priority.",
            recommended_goal="Maintain Health"
        )
