"""
AI Movement Analysis Module for Fluxwell
Analyzes pose data in real-time and provides AI-powered feedback using Groq API
"""

import numpy as np
import math
import time
import requests
import simplejson as json
import threading
from typing import Dict, List, Optional, Tuple

try:
    import win32com.client
    WIN_SAPI_AVAILABLE = True
except ImportError:
    WIN_SAPI_AVAILABLE = False


# Constants for rep counting
REPS_TARGET = 10  # Target reps per set
SETS_TARGET = 3   # Target sets per exercise
REP_COOLDOWN_FRAMES = 15  # Minimum frames between rep counts
REST_TIME_BETWEEN_SETS = 30  # 30 seconds rest between sets/rounds
REST_TIME_BEFORE_NEXT_EXERCISE = 30  # 30 seconds rest before next exercise (auto-progress only)


class RepCounter:
    """Tracks exercise repetitions using a state machine approach."""
    
    def __init__(self, exercise_id, analyzer, exercise_data=None):
        self.exercise_id = exercise_id
        self.reps = 0
        self.sets = 0
        self.state = "waiting"  # States: waiting, down, up, resting, complete
        self.cooldown_counter = 0
        self.analyzer = analyzer  # Reference to parent analyzer for TTS
        
        # Time-based exercise tracking - Initialize from exercise_data
        self.is_time_based = False
        self.target_time = 60  # Default 60 seconds
        self.start_time = None
        self.elapsed_time = 0
        
        # Rest period tracking
        self.is_resting = False
        self.rest_start_time = None
        self.rest_elapsed = 0
        self.rest_announced = False  # Track if we've announced rest
        
        # Initialize time-based settings if provided
        if exercise_data:
            self.is_time_based = exercise_data.get('type') == 'time_based'
            self.target_time = exercise_data.get('target_time', 60)
            print(f"[INFO] RepCounter initialized: exercise={exercise_id}, time_based={self.is_time_based}, target_time={self.target_time}s")
        
    def reset_reps(self):
        """Reset reps/time for a new set."""
        self.reps = 0
        self.state = "waiting"
        self.start_time = None
        self.elapsed_time = 0
        
    def reset_all(self):
        """Reset everything for a new exercise."""
        self.reps = 0
        self.sets = 0
        self.state = "waiting"
        self.cooldown_counter = 0
        self.start_time = None
        self.elapsed_time = 0
        self.is_time_based = False
        self.is_resting = False
        self.rest_start_time = None
        self.rest_elapsed = 0
        self.rest_announced = False
        
    def update(self, landmarks, mp_pose, exercise_id, exercise_data=None):
        """Update rep count or time based on exercise movement."""
        if exercise_id != self.exercise_id:
            self.exercise_id = exercise_id
            self.reset_all()
            
            # Check if this is a time-based exercise
            if exercise_data:
                self.is_time_based = exercise_data.get('type') == 'time_based'
                self.target_time = exercise_data.get('target_time', 60)
        
        # Check if exercise is fully complete
        if self.sets >= SETS_TARGET:
            self.state = "complete"
            if self.is_time_based:
                self.elapsed_time = self.target_time  # Freeze at target
            return self.reps, self.sets, self.state.upper()
        
        # Handle rest period
        if self.is_resting:
            if self.rest_start_time is None:
                self.rest_start_time = time.time()
                # Announce rest start
                if not self.rest_announced:
                    self.analyzer.speak(f"Rest for {REST_TIME_BETWEEN_SETS} seconds.", wait=False, priority=True)
                    self.rest_announced = True
            
            self.rest_elapsed = time.time() - self.rest_start_time
            
            # Check if rest period is over
            if self.rest_elapsed >= REST_TIME_BETWEEN_SETS:
                print(f"[INFO] Rest period complete. Resuming exercise.")
                self.is_resting = False
                self.rest_start_time = None
                self.rest_elapsed = 0
                self.rest_announced = False
                self.state = "waiting"
                self.analyzer.speak(f"Rest complete. Begin next round!", wait=False, priority=True)
            else:
                self.state = "resting"
                return self.reps, self.sets, self.state.upper()
        
        # Time-based exercise logic
        if self.is_time_based:
            if self.start_time is None:
                self.start_time = time.time()
            
            self.elapsed_time = time.time() - self.start_time
            
            # Check if time target reached (only if not already at target sets)
            if self.elapsed_time >= self.target_time and self.sets < SETS_TARGET:
                self.sets += 1
                print(f"\n*** Round {self.sets}/{SETS_TARGET} Complete! ({int(self.elapsed_time)}s) ***")
                
                # Priority announcements for round completion
                if self.sets < SETS_TARGET:
                    self.analyzer.speak(f"Round {self.sets} complete!", wait=False, priority=True)
                    # Start rest period before next round
                    self.is_resting = True
                    self.reset_reps()
                else:
                    # All rounds complete - mark as complete, no more rest
                    self.analyzer.speak(f"All {SETS_TARGET} rounds complete! Excellent work!", wait=False, priority=True)
                    self.state = "complete"
                    self.is_resting = False  # Ensure not in rest state
                    print(f"[INFO] Time-based exercise complete. Timer stopped at {int(self.elapsed_time)}s")
            
            # Freeze elapsed time at target when complete
            if self.sets >= SETS_TARGET:
                self.elapsed_time = min(self.elapsed_time, self.target_time)
            
            return self.reps, self.sets, self.state.upper()
            
        # Cooldown management for rep-based exercises
        if self.cooldown_counter > 0:
            self.cooldown_counter -= 1
            return self.reps, self.sets, self.state.upper()
            
        # Helper to get landmark coordinates
        def get_lm(landmark_name):
            return [
                landmarks[getattr(mp_pose.PoseLandmark, landmark_name).value].x,
                landmarks[getattr(mp_pose.PoseLandmark, landmark_name).value].y
            ]
        
        try:
            # Different rep counting logic for different exercise types
            if exercise_id in ["squat", "lunge_static", "reverse_lunge"]:
                knee_angle = self.analyzer.calculate_angle(
                    get_lm("LEFT_HIP"), get_lm("LEFT_KNEE"), get_lm("LEFT_ANKLE")
                )
                if knee_angle < 100 and self.state != "down":
                    self.state = "down"
                elif knee_angle > 150 and self.state == "down":
                    self.reps += 1
                    self.state = "up"
                    self.cooldown_counter = REP_COOLDOWN_FRAMES
                    self._check_set_complete()
                    
            elif exercise_id in ["bicep_curl_left", "triceps_extension"]:
                elbow_angle = self.analyzer.calculate_angle(
                    get_lm("LEFT_SHOULDER"), get_lm("LEFT_ELBOW"), get_lm("LEFT_WRIST")
                )
                if elbow_angle < 60 and self.state != "up":
                    self.state = "up"
                elif elbow_angle > 140 and self.state == "up":
                    self.reps += 1
                    self.state = "down"
                    self.cooldown_counter = REP_COOLDOWN_FRAMES
                    self._check_set_complete()
                    
            elif exercise_id in ["overhead_press", "side_lateral_raise"]:
                shoulder_angle = self.analyzer.calculate_angle(
                    get_lm("LEFT_ELBOW"), get_lm("LEFT_SHOULDER"), get_lm("LEFT_HIP")
                )
                if shoulder_angle > 160 and self.state != "up":
                    self.state = "up"
                elif shoulder_angle < 120 and self.state == "up":
                    self.reps += 1
                    self.state = "down"
                    self.cooldown_counter = REP_COOLDOWN_FRAMES
                    self._check_set_complete()
                    
            elif exercise_id in ["pushup_bottom"]:
                elbow_angle = self.analyzer.calculate_angle(
                    get_lm("LEFT_SHOULDER"), get_lm("LEFT_ELBOW"), get_lm("LEFT_WRIST")
                )
                if elbow_angle < 100 and self.state != "down":
                    self.state = "down"
                elif elbow_angle > 160 and self.state == "down":
                    self.reps += 1
                    self.state = "up"
                    self.cooldown_counter = REP_COOLDOWN_FRAMES
                    self._check_set_complete()
                    
            elif exercise_id in ["deadlift"]:
                hip_angle = self.analyzer.calculate_angle(
                    get_lm("LEFT_SHOULDER"), get_lm("LEFT_HIP"), get_lm("LEFT_KNEE")
                )
                if hip_angle < 120 and self.state != "down":
                    self.state = "down"
                elif hip_angle > 160 and self.state == "down":
                    self.reps += 1
                    self.state = "up"
                    self.cooldown_counter = REP_COOLDOWN_FRAMES
                    self._check_set_complete()
                    
        except Exception as e:
            pass
            
        return self.reps, self.sets, self.state.upper()
        
    def _check_set_complete(self):
        """Check if a set is complete and announce it."""
        if self.reps >= REPS_TARGET and self.sets < SETS_TARGET:
            self.sets += 1
            print(f"\n*** Set {self.sets}/{SETS_TARGET} Complete! ***")
            self.analyzer.speak(f"Set {self.sets} complete!", wait=False, priority=True)
            
            if self.sets >= SETS_TARGET:
                # All sets complete - mark as complete, no rest period
                self.analyzer.speak(f"All {SETS_TARGET} sets complete! Excellent job!", wait=False, priority=True)
                self.state = "complete"
                self.is_resting = False  # Ensure not resting
                print(f"[INFO] Rep-based exercise complete. All {SETS_TARGET} sets done.")
            else:
                # Start rest period before next set
                self.is_resting = True
                self.reset_reps()
    
    def is_complete(self):
        """Check if all sets/rounds are completed."""
        # Exercise is complete when all sets/rounds are done
        # Should return consistent True once completed (no flickering)
        return self.sets >= SETS_TARGET
    
    def get_rest_remaining(self):
        """Get remaining rest time in seconds."""
        if self.is_resting and self.rest_start_time is not None:
            remaining = REST_TIME_BETWEEN_SETS - self.rest_elapsed
            return max(0, int(remaining))
        return 0


class AIMovementAnalyzer:
    """Analyzes movement patterns and provides AI-powered feedback"""
    
    def __init__(self, api_key: str = None, enable_tts: bool = True):
        # API Configuration
        self.groq_api_key = api_key or ""
        self.groq_model = "llama-3.1-8b-instant"
        
        # Timing Configuration
        self.time_between_feedbacks = 10  # seconds - increased from 8
        self.min_time_between_same_feedback = 20  # seconds - increased from 15
        self.last_feedback_time = 0
        self.last_feedback_text = ""
        self.last_feedback_text_time = 0
        self.last_tts_time = 0  # Track last TTS time separately
        self.tts_cooldown = 3  # Minimum 3 seconds between TTS
        
        # Rep Counter
        self.rep_counter = None
        self.exercise_complete_time = None
        self.exercise_rest_start_time = None  # Track rest before next exercise
        self.auto_progress_delay = REST_TIME_BEFORE_NEXT_EXERCISE  # 30 seconds rest before next exercise
        self.last_switch_time = 0  # Track last exercise switch
        self.is_auto_progressing = False  # Track if we're in auto-progress rest period
        
        # TTS Configuration
        self.tts_enabled = enable_tts and WIN_SAPI_AVAILABLE
        self.tts_engine = None
        if self.tts_enabled:
            try:
                self.tts_engine = win32com.client.Dispatch("SAPI.SpVoice")
                self.tts_engine.Rate = 1
                self.tts_engine.Volume = 90
            except Exception as e:
                print(f"Warning: TTS engine not available: {e}")
                self.tts_enabled = False
        
        # Exercise Configuration
        self.exercises = []
        self.current_exercise_index = 0
        self.current_exercise_data = None
        
        # State
        self.current_ai_feedback = "AI Coach Ready"
        self.errors_detected = []
        
        # Load exercises from JSON
        self._load_exercises()
        
        # Announce initial exercise
        if self.current_exercise_data:
            exercise_name = self.get_current_exercise_name()
            print(f"\n=== AI Analyzer Initialized with: {exercise_name} ===")
            # Delayed announcement so it doesn't get cut off during startup
            import threading
            def announce_start():
                import time
                time.sleep(2)
                if self.current_exercise_data.get('type') == 'time_based':
                    target_time = self.current_exercise_data.get('target_time', 60)
                    self.speak(f"Starting {exercise_name}. Hold for {target_time} seconds, {SETS_TARGET} rounds.", wait=False, priority=True)
                else:
                    self.speak(f"Starting {exercise_name}. {REPS_TARGET} reps, {SETS_TARGET} sets.", wait=False, priority=True)
            threading.Thread(target=announce_start, daemon=True).start()
    
    def _load_exercises(self):
        """Load exercise rules from JSON file"""
        try:
            import os
            script_dir = os.path.dirname(os.path.abspath(__file__))
            exercise_file = os.path.join(script_dir, "exercises.json")
            
            print(f"[INFO] Looking for exercises.json at: {exercise_file}")
            
            # Fallback to Video_analysis folder
            if not os.path.exists(exercise_file):
                print(f"[WARN] File not found at primary location, trying fallback...")
                parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
                exercise_file = os.path.join(parent_dir, "Video_analysis", "exercises.json")
                print(f"[INFO] Trying fallback location: {exercise_file}")
            
            if os.path.exists(exercise_file):
                with open(exercise_file, 'r') as f:
                    self.exercises = json.load(f)
                    if self.exercises:
                        self.current_exercise_data = self.exercises[0]
                        self.rep_counter = RepCounter(self.current_exercise_data['id'], self, self.current_exercise_data)
                        first_exercise = self.exercises[0].get('name', 'Unknown')
                        print(f"[SUCCESS] Loaded {len(self.exercises)} exercises from {exercise_file}")
                        print(f"[SUCCESS] First exercise: {first_exercise}")
                    else:
                        print(f"[WARN] Exercise file is empty")
                        self._create_default_exercises()
            else:
                print(f"[ERROR] Exercise file not found at {exercise_file}")
                self._create_default_exercises()
        except Exception as e:
            print(f"[ERROR] Error loading exercises: {e}")
            import traceback
            traceback.print_exc()
            self._create_default_exercises()
    
    def _create_default_exercises(self):
        """Create default exercise set if JSON not found"""
        print("[WARN] Using DEFAULT fallback exercise (Squat only)")
        self.exercises = [
            {
                "id": "squat",
                "name": "Squat",
                "rules": [
                    {
                        "type": "angle_check",
                        "a": "LEFT_HIP",
                        "b": "LEFT_KNEE",
                        "c": "LEFT_ANKLE",
                        "min": 75,
                        "max": 105,
                        "error_min": "Hips dropped too deep",
                        "error_max": "Squat depth is too shallow"
                    }
                ]
            }
        ]
        self.current_exercise_data = self.exercises[0]
        self.rep_counter = RepCounter(self.current_exercise_data['id'], self, self.current_exercise_data)
    
    def speak(self, text: str, wait: bool = False, priority: bool = False):
        """Provide verbal feedback using TTS with cooldown to prevent irritation.
        
        Args:
            text: The text to speak
            wait: Whether to wait for speech to complete
            priority: If True, bypass cooldown (for critical announcements like round/set completion)
        """
        if not self.tts_enabled or not self.tts_engine:
            print(f"[SPEECH]: {text}")
            return
        
        # Check cooldown unless priority announcement
        current_time = time.time()
        if not priority and (current_time - self.last_tts_time < self.tts_cooldown):
            print(f"[TTS BLOCKED] Cooldown active. Message: {text}")
            return
        
        try:
            flag = 0 if wait else 1
            self.tts_engine.Speak(text, flag)
            self.last_tts_time = current_time
        except Exception as e:
            print(f"TTS Error: {e}")
    
    def calculate_angle(self, a: List[float], b: List[float], c: List[float]) -> float:
        """Calculate angle between three points where b is the vertex"""
        a = np.array(a)
        b = np.array(b)
        c = np.array(c)
        
        radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
        angle = np.abs(radians * 180.0 / np.pi)
        
        if angle > 180.0:
            angle = 360 - angle
        
        return angle
    
    def get_vertical_offset(self, p1: List[float], p2: List[float], threshold: float = 0.05) -> bool:
        """Check if two points are vertically misaligned"""
        return abs(p1[0] - p2[0]) > threshold
    
    def get_horizontal_offset(self, p1: List[float], p2: List[float], threshold: float = 0.05) -> bool:
        """Check if two points are horizontally misaligned"""
        return abs(p1[1] - p2[1]) > threshold
    
    def check_pose(self, landmarks: List, mp_pose, exercise_data: Dict = None) -> List[str]:
        """Check pose against exercise rules and return list of errors"""
        errors = []
        
        if exercise_data is None:
            exercise_data = self.current_exercise_data
        
        if not exercise_data or not landmarks:
            return errors
        
        # Helper to get landmark coordinates
        def get_lm(landmark_name: str) -> List[float]:
            try:
                idx = getattr(mp_pose.PoseLandmark, landmark_name).value
                return [landmarks[idx].x, landmarks[idx].y]
            except:
                return [0, 0]
        
        # Check each rule
        for rule in exercise_data.get('rules', []):
            rule_type = rule['type']
            
            try:
                if rule_type == "angle_check":
                    p_a = get_lm(rule['a'])
                    p_b = get_lm(rule['b'])
                    p_c = get_lm(rule['c'])
                    
                    angle = self.calculate_angle(p_a, p_b, p_c)
                    
                    if 'min' in rule and angle < rule['min']:
                        errors.append(rule['error_min'])
                    
                    if 'max' in rule and angle > rule['max']:
                        errors.append(rule['error_max'])
                
                elif rule_type == "vertical_alignment":
                    p1 = get_lm(rule['p1'])
                    p2 = get_lm(rule['p2'])
                    
                    if self.get_vertical_offset(p1, p2):
                        errors.append(rule['error'])
                
                elif rule_type == "horizontal_alignment":
                    p1 = get_lm(rule['p1'])
                    p2 = get_lm(rule['p2'])
                    
                    if self.get_horizontal_offset(p1, p2):
                        errors.append(rule['error'])
                
                elif rule_type == "distance_check":
                    p1 = get_lm(rule['p1'])
                    p2 = get_lm(rule['p2'])
                    
                    distance = math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
                    
                    if 'min' in rule and distance < rule['min']:
                        errors.append(rule['error_min'])
                    
                    if 'max' in rule and distance > rule['max']:
                        errors.append(rule['error_max'])
            
            except Exception as e:
                pass  # Skip rules that fail
        
        return errors
    
    def get_ai_feedback(self, errors: List[str], exercise_name: str) -> str:
        """Get AI-powered feedback from Groq API"""
        if not self.groq_api_key or self.groq_api_key == "YOUR_GROQ_API_KEY_HERE":
            return "AI Coach: No API key configured"
        
        if not errors:
            return "Form is solid! Keep that energy up."
        
        error_list = ", ".join(errors)
        user_query = f"The user is performing a {exercise_name}. They are currently making the following errors: {error_list}. Provide a single, short, encouraging, and actionable piece of advice (1-2 sentences max) to correct their form. Do not start with 'Your errors are...'. Focus only on the solution."
        
        system_prompt = (
            "You are a highly efficient, supportive, and concise personal fitness coach. "
            "Your only job is to provide direct, specific, and actionable verbal cues to improve "
            "exercise form. Keep all responses under 15 words. Use simple, non-dramatic language."
        )
        
        try:
            payload = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_query}
                ],
                "model": self.groq_model,
                "temperature": 0.0,
                "max_tokens": 50,
            }
            
            headers = {
                "Authorization": f"Bearer {self.groq_api_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=3
            )
            response.raise_for_status()
            
            data = response.json()
            ai_response = data['choices'][0]['message']['content'].strip()
            
            # Speak the feedback using normal speak() method with cooldown
            # No need for background thread, speak() already handles async
            if self.tts_enabled:
                self.speak(ai_response, wait=False)
            
            return ai_response
        
        except Exception as e:
            return f"AI Coach: {errors[0]}"  # Fallback to first error
    
    def analyze_movement(self, landmarks: List, mp_pose) -> Tuple[str, List[str]]:
        """
        Analyze movement and return feedback
        Returns: (feedback_text, errors_list)
        """
        current_time = time.time()
        
        # Update rep counter
        if self.rep_counter and self.current_exercise_data:
            self.rep_counter.update(landmarks, mp_pose, self.current_exercise_data['id'], self.current_exercise_data)
            
            # Check for auto-progression
            if self.rep_counter.is_complete():
                if self.exercise_complete_time is None:
                    self.exercise_complete_time = current_time
                    self.exercise_rest_start_time = current_time
                    self.is_auto_progressing = True
                    rep_state = self.rep_counter
                    print(f"[AUTO-PROGRESS] Exercise complete detected! Sets={rep_state.sets}/{SETS_TARGET}, State={rep_state.state}, Resting={rep_state.is_resting}")
                    print(f"[AUTO-PROGRESS] Starting {self.auto_progress_delay}s rest period before next exercise.")
                    self.speak(f"Exercise complete! Rest for {self.auto_progress_delay} seconds before next exercise.", wait=False, priority=True)
                
                # Calculate elapsed time for auto-progress
                elapsed_since_complete = current_time - self.exercise_complete_time
                
                # Auto-progress after rest delay
                if elapsed_since_complete >= self.auto_progress_delay:
                    if current_time - self.last_switch_time > 2:  # At least 2 seconds between switches
                        print(f"[AUTO-PROGRESS] Rest complete ({elapsed_since_complete:.1f}s). Switching to next exercise.")
                        self.last_switch_time = current_time
                        self.is_auto_progressing = False
                        self.switch_exercise(1)
                    else:
                        print(f"[AUTO-PROGRESS] Waiting for debounce cooldown ({current_time - self.last_switch_time:.1f}s)")
                else:
                    # Log countdown every 5 seconds
                    remaining = self.auto_progress_delay - elapsed_since_complete
                    if int(remaining) % 5 == 0 and int(remaining) != int(self.auto_progress_delay):
                        print(f"[AUTO-PROGRESS] Rest countdown: {int(remaining)}s remaining")
            else:
                # Reset auto-progress state if exercise is not complete
                if self.exercise_complete_time is not None:
                    print(f"[AUTO-PROGRESS] Cancelled - exercise no longer complete (sets={self.rep_counter.sets})")
                self.exercise_complete_time = None
                self.exercise_rest_start_time = None
                self.is_auto_progressing = False
        
        # Check pose against current exercise
        errors = self.check_pose(landmarks, mp_pose)
        self.errors_detected = errors
        
        # Don't provide feedback during rest or after completion
        if self.rep_counter and (self.rep_counter.is_resting or self.rep_counter.is_complete()):
            self.current_ai_feedback = "Exercise complete. Great work!" if self.rep_counter.is_complete() else "Rest period - relax and breathe."
            return self.current_ai_feedback, errors
        
        # Determine if we should provide new feedback
        if errors and (current_time - self.last_feedback_time > self.time_between_feedbacks):
            new_feedback = self.get_ai_feedback(errors, self.current_exercise_data.get('name', 'Exercise'))
            
            # Check if it's the same feedback
            if new_feedback != self.last_feedback_text or \
               (current_time - self.last_feedback_text_time > self.min_time_between_same_feedback):
                self.current_ai_feedback = new_feedback
                self.last_feedback_time = current_time
                self.last_feedback_text = new_feedback
                self.last_feedback_text_time = current_time
        
        elif not errors and self.current_ai_feedback != "Form is solid! Keep that energy up.":
            # Only update positive feedback once to avoid message spam
            self.current_ai_feedback = "Form is solid! Keep that energy up."
        
        return self.current_ai_feedback, errors
    
    def set_exercise(self, exercise_index: int):
        """Change the current exercise"""
        if 0 <= exercise_index < len(self.exercises):
            self.current_exercise_index = exercise_index
            self.current_exercise_data = self.exercises[exercise_index]
            exercise_name = self.current_exercise_data.get('name', 'Exercise')
            self.speak(f"Now analyzing {exercise_name}")
            return True
        return False
    
    def get_current_exercise_name(self) -> str:
        """Get the name of the current exercise"""
        if self.current_exercise_data:
            return self.current_exercise_data.get('name', 'Unknown')
        return 'No Exercise Selected'
    
    def switch_exercise(self, direction: int = 1):
        """Switch to next or previous exercise. direction: 1=next, -1=prev"""
        if not self.exercises:
            print("[WARN] Cannot switch exercise: no exercises loaded")
            return
        
        # Debounce: prevent rapid switching
        current_time = time.time()
        if current_time - self.last_switch_time < 1.0:  # 1 second debounce
            print(f"[WARN] Exercise switch debounced (too soon after last switch)")
            return
        
        # Calculate new index
        new_index = (self.current_exercise_index + direction) % len(self.exercises)
        
        # Prevent switching to same exercise (shouldn't happen with modulo, but safe check)
        if new_index == self.current_exercise_index:
            print("[WARN] Cannot switch: already at the target exercise")
            return
        
        # Update state
        self.current_exercise_index = new_index
        self.current_exercise_data = self.exercises[self.current_exercise_index]
        self.rep_counter = RepCounter(self.current_exercise_data['id'], self, self.current_exercise_data)
        self.exercise_complete_time = None
        self.exercise_rest_start_time = None
        self.is_auto_progressing = False
        self.last_feedback_text = ""
        self.last_feedback_time = 0  # Reset feedback timer
        self.last_switch_time = current_time  # Update switch time
        
        exercise_name = self.get_current_exercise_name()
        print(f"\n=== Exercise Changed to: {exercise_name} (index {new_index}/{len(self.exercises)-1}) ===")
        
        # Announce appropriately based on exercise type
        if self.current_exercise_data.get('type') == 'time_based':
            target_time = self.current_exercise_data.get('target_time', 60)
            self.speak(f"Starting {exercise_name}. Hold for {target_time} seconds, {SETS_TARGET} rounds.", wait=False, priority=True)
        else:
            self.speak(f"Starting {exercise_name}. {REPS_TARGET} reps, {SETS_TARGET} sets.", wait=False, priority=True)
    
    def reset_reps(self):
        """Reset reps and sets - recreate rep counter to preserve exercise type"""
        if self.rep_counter:
            # Store the current exercise type and data before resetting
            was_time_based = self.rep_counter.is_time_based
            exercise_name = self.get_current_exercise_name()

            # Recreate rep counter with current exercise data to preserve type
            self.rep_counter = RepCounter(self.current_exercise_data['id'], self, self.current_exercise_data)
            self.exercise_complete_time = None
            self.exercise_rest_start_time = None
            self.is_auto_progressing = False
            self.last_feedback_text = ""
            self.last_feedback_time = 0  # Reset feedback timer

            if was_time_based:
                print(f"\n=== Time and Rounds Reset for: {exercise_name} ===")
                self.speak(f"Resetting timer for {exercise_name}.", wait=False, priority=True)
            else:
                print(f"\n=== Reps and Sets Reset for: {exercise_name} ===")
                self.speak(f"Resetting {exercise_name}.", wait=False, priority=True)
    
    def get_rep_state(self):
        """Get current rep counter state"""
        if self.rep_counter:
            state = {
                'reps': self.rep_counter.reps,
                'sets': self.rep_counter.sets,
                'state': self.rep_counter.state.upper(),
                'target_reps': REPS_TARGET,
                'target_sets': SETS_TARGET,
                'is_time_based': self.rep_counter.is_time_based,
                'is_resting': self.rep_counter.is_resting,
                'rest_remaining': self.rep_counter.get_rest_remaining()
            }
            
            if self.rep_counter.is_time_based:
                state['elapsed_time'] = self.rep_counter.elapsed_time
                state['target_time'] = self.rep_counter.target_time
            
            # Add auto-progress rest info
            if self.is_auto_progressing and self.exercise_rest_start_time:
                rest_elapsed = time.time() - self.exercise_rest_start_time
                state['exercise_rest_remaining'] = max(0, int(self.auto_progress_delay - rest_elapsed))
            else:
                state['exercise_rest_remaining'] = 0
            
            return state
        return None
    
    def enable_analysis(self, enabled: bool = True):
        """Enable or disable AI analysis"""
        self.analysis_enabled = enabled
