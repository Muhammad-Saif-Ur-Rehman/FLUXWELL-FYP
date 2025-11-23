"""
Capture script for Fluxwell - adapted for FastAPI integration
Processes webcam or video file input and sends keypoints/video to FastAPI websocket endpoints
"""

import cv2
import mediapipe as mp
import numpy as np
import time
import sys
import os
import argparse
import asyncio
import websockets
import json
import base64
import threading
from  dotenv import load_dotenv
# Add parent directory to path for imports

load_dotenv()
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts import processing
from services.keypoint_processor import get_keypoint_processor
from services.video_processor import get_video_processor
from scripts.ai_movement_analyzer import AIMovementAnalyzer

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Get processor instances (for backward compatibility)
keypoint_processor = get_keypoint_processor()
video_processor = get_video_processor()

# Initialize AI Movement Analyzer (will be configured in main)
ai_analyzer = None

# WebSocket sender for sending data to the main server
class WebSocketSender:
    def __init__(self, server_url="ws://localhost:8000"):
        self.server_url = server_url
        self.keypoints_ws = None
        self.video_ws = None
        self.loop = None
        self.thread = None
        self.keypoints_queue = None
        self.video_queue = None
        self.command_queue = None
        self.running = False
        
    def start(self):
        """Start WebSocket sender in a background thread"""
        self.running = True
        self.thread = threading.Thread(target=self._run_async_loop, daemon=True)
        self.thread.start()
        time.sleep(1.0)  # Give it time to connect
        
    def _run_async_loop(self):
        """Run asyncio event loop in thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        # Create queues in this event loop
        self.keypoints_queue = asyncio.Queue()
        self.video_queue = asyncio.Queue()
        self.command_queue = asyncio.Queue()
        self.loop.run_until_complete(self._connect_and_send())
        
    async def _connect_and_send(self):
        """Connect to WebSocket servers and send data with retry logic"""
        log_file = open("capture_websocket.log", "a")
        max_retries = 5
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                log_file.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Attempt {attempt + 1}/{max_retries}: Connecting to {self.server_url}\n")
                log_file.flush()
                
                # Connect to capture-specific endpoints (for sending data TO server) with timeout
                keypoints_ws = await asyncio.wait_for(
                    websockets.connect(
                        f"{self.server_url}/api/movement/ws/capture/keypoints",
                        ping_interval=20,
                        ping_timeout=10
                    ),
                    timeout=5.0
                )
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Keypoints WebSocket connected\n")
                log_file.flush()
                
                video_ws = await asyncio.wait_for(
                    websockets.connect(
                        f"{self.server_url}/api/movement/ws/capture/video",
                        ping_interval=20,
                        ping_timeout=10
                    ),
                    timeout=5.0
                )
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Video WebSocket connected\n")
                log_file.flush()
                
                async with keypoints_ws, video_ws:
                    self.keypoints_ws = keypoints_ws
                    self.video_ws = video_ws
                    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Connected to WebSocket server\n")
                    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting sender tasks...\n")
                    log_file.flush()
                    
                    # Create tasks for sending data and receiving commands
                    try:
                        await asyncio.gather(
                            self._send_keypoints(),
                            self._send_video(),
                            self._receive_commands()
                        )
                    except Exception as e:
                        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Sender tasks error: {e}\n")
                        import traceback
                        traceback.print_exc(file=log_file)
                        log_file.flush()
                    break  # If we get here, connection was successful and completed
                    
            except Exception as e:
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Connection attempt {attempt + 1} failed: {e}\n")
                
                if attempt < max_retries - 1:
                    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Retrying in {retry_delay} seconds...\n")
                    log_file.flush()
                    await asyncio.sleep(retry_delay)
                else:
                    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Max retries reached. Giving up.\n")
                    import traceback
                    traceback.print_exc()
                    traceback.print_exc(file=log_file)
                log_file.flush()
        
        log_file.close()
            
    async def _send_keypoints(self):
        """Send keypoints from queue"""
        while self.running:
            try:
                # Wait for keypoints data with timeout
                try:
                    data = await asyncio.wait_for(self.keypoints_queue.get(), timeout=0.1)
                    if self.keypoints_ws:
                        await self.keypoints_ws.send(json.dumps(data))
                except asyncio.TimeoutError:
                    continue
            except Exception as e:
                pass
                
    async def _send_video(self):
        """Send video frames from queue"""
        frame_count = 0
        log_file = open("capture_video_send.log", "a")
        log_file.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Video sender started\n")
        log_file.flush()
        
        while self.running:
            try:
                # Wait for video data with timeout
                try:
                    data = await asyncio.wait_for(self.video_queue.get(), timeout=0.1)
                    if self.video_ws:
                        await self.video_ws.send(json.dumps(data))
                        frame_count += 1
                        if frame_count % 30 == 0:
                            log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Sent {frame_count} video frames\n")
                            log_file.flush()
                except asyncio.TimeoutError:
                    continue
            except Exception as e:
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error sending video frame {frame_count}: {e}\n")
                log_file.flush()
        
        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Video sender stopped (sent {frame_count} frames total)\n")
        log_file.close()
    
    async def _receive_commands(self):
        """Receive commands from server via keypoints WebSocket"""
        log_file = open("capture_commands.log", "a")
        log_file.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Command receiver started\n")
        log_file.flush()
        
        while self.running:
            try:
                if self.keypoints_ws:
                    # Listen for incoming messages
                    message = await asyncio.wait_for(self.keypoints_ws.recv(), timeout=0.1)
                    data = json.loads(message)
                    
                    if data.get('type') == 'command':
                        command = data.get('command')
                        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Received command: {command}\n")
                        log_file.flush()
                        
                        # Put command in queue for main thread
                        await self.command_queue.put(command)
                        
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                if self.running:
                    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error receiving command: {e}\n")
                    log_file.flush()
        
        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Command receiver stopped\n")
        log_file.close()
    
    def get_command(self):
        """Get command from queue (non-blocking)"""
        if self.loop and self.command_queue:
            try:
                # Use a more reliable approach to get commands
                async def try_get():
                    try:
                        return await asyncio.wait_for(self.command_queue.get(), timeout=0.001)
                    except asyncio.TimeoutError:
                        return None
                
                future = asyncio.run_coroutine_threadsafe(try_get(), self.loop)
                result = future.result(timeout=0.1)
                return result
            except Exception as e:
                return None
        return None
                
    def send_keypoints(self, keypoints_dict):
        """Queue keypoints for sending"""
        if self.running and self.loop and self.keypoints_queue:
            try:
                asyncio.run_coroutine_threadsafe(
                    self.keypoints_queue.put(keypoints_dict),
                    self.loop
                )
            except Exception as e:
                pass
            
    def send_video_frame(self, frame):
        """Queue video frame for sending"""
        if not self.running:
            return
        if not self.loop or not self.video_queue:
            return
            
        try:
            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            base64_frame = base64.b64encode(buffer).decode('utf-8')
            
            frame_data = {
                "image": base64_frame,
                "timestamp": time.time()
            }
            
            asyncio.run_coroutine_threadsafe(
                self.video_queue.put(frame_data),
                self.loop
            )
        except Exception as e:
            pass
                
    def stop(self):
        """Stop WebSocket sender"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)

# Global WebSocket sender instance
ws_sender = WebSocketSender()

# Set up argument parser
parser = argparse.ArgumentParser(description='Process video for pose detection and keypoint extraction')
parser.add_argument('--video', type=str, help='Path to video file. If not provided, webcam will be used.')
parser.add_argument('--delay', type=int, default=1, help='Delay between frames in milliseconds (for video files only).')
parser.add_argument('--loop', action='store_true', help='Loop the video file when it reaches the end.')
parser.add_argument('--frame-rate', type=int, default=30, help='Target frame rate for video processing. Default: 30 fps')
parser.add_argument('--ai-analysis', action='store_true', default=True, help='Enable AI movement analysis with feedback (enabled by default)')
parser.add_argument('--no-ai', action='store_true', help='Disable AI movement analysis')
parser.add_argument('--groq-api-key', type=str, help='Groq API key for AI feedback', default=GROQ_API_KEY)
parser.add_argument('--show-window', action='store_true', help='Show local preview window with pose detection (enables keyboard shortcuts)')
parser.add_argument('--demo-mode', action='store_true', help='Run in demo mode with mock pose data when camera is unavailable')
args = parser.parse_args()

# Handle --no-ai flag
if args.no_ai:
    args.ai_analysis = False

def initialize_video_source():
    """Initialize video capture from webcam or file"""
    log = open("camera_init.log", "a", encoding="utf-8")
    log.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] === Initializing video source ===\n")
    log.flush()
    
    if args.video:
        video_path = args.video
        
        # Clean up path
        video_path = video_path.strip().strip('"').strip("'")
        
        # Search for video file if only filename provided
        if not os.path.sep in video_path and not '/' in video_path:
            search_dirs = [
                os.path.dirname(os.path.abspath(__file__)),
                os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "videos"),
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "videos"),
            ]
            
            found = False
            for directory in search_dirs:
                if os.path.exists(directory):
                    potential_path = os.path.join(directory, video_path)
                    if os.path.exists(potential_path):
                        video_path = potential_path
                        found = True
                        break
                    
                    for ext in ['.mp4', '.avi', '.mov', '.mkv', '.webm']:
                        if not video_path.endswith(ext):
                            potential_path_with_ext = os.path.join(directory, video_path + ext)
                            if os.path.exists(potential_path_with_ext):
                                video_path = potential_path_with_ext
                                found = True
                                break
                    if found:
                        break
            
            if not found:
                return cv2.VideoCapture(0)
        
        video_path = os.path.normpath(video_path)
        
        if not os.path.isabs(video_path):
            script_dir = os.path.dirname(os.path.abspath(__file__))
            video_path = os.path.join(script_dir, video_path)
        
        video_path = os.path.normpath(video_path)
        
        if not os.path.exists(video_path):
            return cv2.VideoCapture(0)
        
        cap = cv2.VideoCapture(video_path)
        
        # Print video info
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        return cap
    else:
        log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] No video file specified, attempting webcam capture (index 0)\n")
        log.flush()
        
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)  # Try DirectShow on Windows for better compatibility
        
        if cap.isOpened():
            log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✓ Webcam opened successfully with DirectShow\n")
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            actual_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Camera resolution: {actual_w}x{actual_h}\n")
        else:
            log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✗ Failed to open webcam with DirectShow, trying default backend\n")
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✓ Webcam opened with default backend\n")
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            else:
                log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✗ Failed to open webcam with all backends\n")
        
        log.close()
        return cap


def main():
    """Main capture loop"""
    global ai_analyzer
    
    # Log to file since subprocess has no console
    log_file = open("capture_main.log", "a", encoding="utf-8")
    log_file.write(f"\n{'='*60}\n")
    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Fluxwell Capture System - Starting...\n")
    log_file.flush()
    
    # Initialize AI Movement Analyzer if enabled
    if args.ai_analysis:
        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Initializing AI Movement Analyzer...\n")
        log_file.flush()
        ai_analyzer = AIMovementAnalyzer(
            api_key= GROQ_API_KEY,
            enable_tts=True
        )
        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] AI Analyzer initialized\n")
        log_file.flush()
    
    # Initialize video source
    cap = initialize_video_source()

    if not cap.isOpened():
        # Try alternative camera indices (0, 1, 2)
        log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Camera index 0 failed, trying alternatives...\n")
        log_file.flush()
        camera_found = False
        
        for camera_idx in [1, 2]:
            log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Trying camera index {camera_idx}...\n")
            log_file.flush()
            cap = cv2.VideoCapture(camera_idx)
            if cap.isOpened():
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✓ Camera found at index {camera_idx}\n")
                log_file.flush()
                camera_found = True
                break
            else:
                cap.release()
        
        if not camera_found:
            if args.demo_mode:
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Demo mode: No camera available, using mock data\n")
                log_file.flush()
                print("📹 Demo mode: Camera not available, using mock pose data")
                # Create a mock video capture object for demo mode
                class MockVideoCapture:
                    def __init__(self):
                        self.frame_count = 0
                        self.mock_width = 640
                        self.mock_height = 480

                    def isOpened(self):
                        return True

                    def read(self):
                        self.frame_count += 1
                        # Create a simple colored frame
                        frame = np.zeros((self.mock_height, self.mock_width, 3), dtype=np.uint8)
                        # Add some mock content - simple gradient
                        for y in range(self.mock_height):
                            for x in range(self.mock_width):
                                frame[y, x] = [x % 256, y % 256, (x + y) % 256]
                        return True, frame

                    def get(self, prop):
                        if prop == cv2.CAP_PROP_FRAME_WIDTH:
                            return self.mock_width
                        elif prop == cv2.CAP_PROP_FRAME_HEIGHT:
                            return self.mock_height
                        elif prop == cv2.CAP_PROP_FPS:
                            return 30
                        return 0

                    def set(self, prop, value):
                        return True

                    def release(self):
                        pass

                cap = MockVideoCapture()
            else:
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error: Could not open video source (camera not available or in use)\n")
                log_file.flush()
                
                # Instead of exiting, keep the WebSocket connection alive and send a status message
                error_msg = {
                    "type": "error",
                    "message": "Camera not available",
                    "details": "Make sure your camera is connected and not being used by another application."
                }
                
                # Keep sending error status every 5 seconds
                log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Keeping connection alive, waiting for camera...\n")
                log_file.close()
                
                try:
                    while True:
                        ws_sender.send_keypoints(error_msg)
                        time.sleep(5)
                        
                        # Try to reconnect to camera
                        for idx in [0, 1, 2]:
                            cap = cv2.VideoCapture(idx)
                            if cap.isOpened():
                                print(f"✓ Camera reconnected at index {idx}")
                                break
                            cap.release()
                        
                        if cap.isOpened():
                            print("✓ Camera reconnected, starting capture...")
                            break
                except KeyboardInterrupt:
                    print("\n>>> Interrupted by user")
                    ws_sender.stop()
                    return
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Video source opened with resolution: {width}x{height}\n")
    log_file.flush()
    
    # Start WebSocket sender
    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting WebSocket sender...\n")
    log_file.flush()
    ws_sender.start()
    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] WebSocket sender thread started\n")
    log_file.flush()
    
    # Give WebSocket time to connect
    time.sleep(2)
    log_file.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Proceeding to main capture loop\n")
    log_file.close()
    
    # Configure BlazePose
    with mp_pose.Pose(
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        enable_segmentation=True,
    ) as pose:
        
        prev_frame_time = 0
        fps_values = []
        fps_smooth = 0
        
        # Calculate frame skipping for video files
        frame_skip = 1
        if args.video:
            video_fps = cap.get(cv2.CAP_PROP_FPS)
            if video_fps > args.frame_rate:
                frame_skip = max(1, int(video_fps / args.frame_rate))
        
        frame_count = 0
        target_width = 640
        pose_detected_count = 0
        loop_log = open("capture_loop.log", "a")
        loop_log.write(f"\n{'='*60}\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting capture loop\n")
        loop_log.flush()
        
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                if args.video and args.loop:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_count = 0
                    continue
                else:
                    error_msg = "End of video reached or error reading frame."
                    loop_log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {error_msg}\n")
                    loop_log.close()
                    break
            
            frame_count += 1
            if frame_count % 100 == 0:
                loop_log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Processed {frame_count} frames, {pose_detected_count} with pose\n")
                loop_log.flush()

            # Generate mock pose data for demo mode
            if hasattr(cap, '__class__') and 'MockVideoCapture' in str(cap.__class__):
                # Create mock pose keypoints that simulate a person doing exercises
                mock_keypoints = generate_mock_pose_data(frame_count)
                # Send mock keypoints to FastAPI
                keypoints_dict = {
                    "timestamp": time.time(),
                    "dnn_enabled": True,
                    **mock_keypoints
                }
                ws_sender.send_keypoints(keypoints_dict)

                # Send mock video frame
                ws_sender.send_video_frame(frame)

                # Small delay for demo mode
                time.sleep(0.03)  # ~30fps
                continue
            
            # Skip frames for video files
            if args.video and frame_count % frame_skip != 0:
                continue
            
            # Resize video frames
            if args.video:
                target_height = int(height * (target_width / width))
                frame = cv2.resize(frame, (target_width, target_height))
            
            # Flip for webcam
            if not args.video:
                frame = cv2.flip(frame, 1)
            
            # Process with MediaPipe
            frame.flags.writeable = False
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image_rgb)
            
            frame.flags.writeable = True
            image = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
            
            # Draw pose landmarks
            if results.pose_landmarks:
                mp_drawing.draw_landmarks(
                    image,
                    results.pose_landmarks,
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing_styles.get_default_pose_landmarks_style()
                )
                
                # Calculate FPS
                curr_frame_time = time.time()
                fps = 1 / (curr_frame_time - prev_frame_time) if prev_frame_time > 0 else 0
                prev_frame_time = curr_frame_time
                
                fps_values.append(fps)
                if len(fps_values) > 10:
                    fps_values.pop(0)
                fps_smooth = sum(fps_values) / len(fps_values)
                
                fps_text = f"FPS: {fps_smooth:.1f}"
                
                # Process world landmarks
                if results.pose_world_landmarks:
                    pose_detected_count += 1
                    world_landmarks = results.pose_world_landmarks.landmark
                    
                    # Get mapped keypoints
                    _, mapped_keypoints = processing.process_frame(image, world_landmarks, return_keypoints=True)
                    
                    # AI Movement Analysis
                    ai_feedback = ""
                    ai_errors = []
                    if ai_analyzer and results.pose_landmarks:
                        ai_feedback, ai_errors = ai_analyzer.analyze_movement(
                            results.pose_landmarks.landmark,
                            mp_pose
                        )
                    
                    # Send keypoints to FastAPI
                    if mapped_keypoints:
                        keypoints_dict = {}
                        for i, name in enumerate(processing.OUTPUT_KEYPOINT_ORDER):
                            if i < len(mapped_keypoints):
                                keypoints_dict[name] = mapped_keypoints[i]
                        
                        # Add raw MediaPipe world landmarks for avatar animation
                        keypoints_dict["world_landmarks"] = [[lm.x, lm.y, lm.z] for lm in world_landmarks]
                        
                        keypoints_dict["dnn_enabled"] = processing.use_dnn_correction
                        
                        if args.video:
                            keypoints_dict["timestamp"] = time.time()
                        
                        # Add AI analysis data if available
                        if ai_analyzer:
                            keypoints_dict["ai_feedback"] = ai_feedback
                            keypoints_dict["ai_errors"] = ai_errors
                            keypoints_dict["current_exercise"] = ai_analyzer.get_current_exercise_name()
                            rep_state = ai_analyzer.get_rep_state()
                            if rep_state:
                                keypoints_dict["reps"] = rep_state['reps']
                                keypoints_dict["sets"] = rep_state['sets']
                                keypoints_dict["rep_state"] = rep_state['state']
                                keypoints_dict["target_reps"] = rep_state['target_reps']
                                keypoints_dict["target_sets"] = rep_state['target_sets']
                                # Add time-based exercise fields
                                keypoints_dict["is_time_based"] = rep_state.get('is_time_based', False)
                                if rep_state.get('is_time_based', False):
                                    keypoints_dict["elapsed_time"] = rep_state.get('elapsed_time', 0)
                                    keypoints_dict["target_time"] = rep_state.get('target_time', 60)
                                # Add rest period fields
                                keypoints_dict["is_resting"] = rep_state.get('is_resting', False)
                                keypoints_dict["rest_remaining"] = rep_state.get('rest_remaining', 0)
                                keypoints_dict["exercise_rest_remaining"] = rep_state.get('exercise_rest_remaining', 0)
                        
                        # Update keypoint processor (for backward compatibility)
                        keypoint_processor.update_keypoints(keypoints_dict)
                        
                        # Send via WebSocket to server
                        ws_sender.send_keypoints(keypoints_dict)
                    
                    # Prepare video frame with overlays
                    h, w = image.shape[:2]
                    display_frame = image.copy()
                    
                    # Top header with FPS and title
                    cv2.rectangle(display_frame, (0, 0), (w, 110), (0, 0, 0), -1)
                    cv2.putText(display_frame, "Real-Time Pose Detection", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    cv2.putText(display_frame, fps_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    
                    # Add AI feedback overlay if enabled
                    if ai_analyzer:
                        exercise_name = ai_analyzer.get_current_exercise_name()
                        rep_state = ai_analyzer.get_rep_state()
                        
                        # Exercise name in header
                        cv2.putText(display_frame, f"Exercise: {exercise_name}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                        
                        # Show reps/sets or time in top right based on exercise type
                        if rep_state:
                            # Check for rest periods
                            is_resting = rep_state.get('is_resting', False)
                            rest_remaining = rep_state.get('rest_remaining', 0)
                            exercise_rest_remaining = rep_state.get('exercise_rest_remaining', 0)
                            
                            # Show exercise rest period (before next exercise)
                            if exercise_rest_remaining > 0:
                                rest_text = f"REST BEFORE NEXT: {exercise_rest_remaining}s"
                                cv2.putText(display_frame, rest_text, (w - 350, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 165, 0), 2)
                                cv2.putText(display_frame, "Exercise Complete!", (w - 350, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                            # Show set/round rest period
                            elif is_resting and rest_remaining > 0:
                                rest_text = f"REST: {rest_remaining}s"
                                cv2.putText(display_frame, rest_text, (w - 220, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 165, 0), 2)
                                sets = rep_state['sets']
                                target_sets = rep_state['target_sets']
                                cv2.putText(display_frame, f"Completed: {sets}/{target_sets}", (w - 220, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)
                            elif rep_state.get('is_time_based', False):
                                # Time-based exercise - ONLY show time and rounds
                                elapsed = rep_state.get('elapsed_time', 0)
                                target = rep_state.get('target_time', 60)
                                sets = rep_state['sets']
                                target_sets = rep_state['target_sets']
                                
                                time_text = f"Time: {int(elapsed)}s / {target}s"
                                rounds_text = f"Rounds: {sets}/{target_sets}"
                                
                                # Change color to green when all rounds complete
                                display_color = (0, 255, 0) if sets >= target_sets else (0, 255, 255)
                                
                                cv2.putText(display_frame, time_text, (w - 220, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, display_color, 2)
                                cv2.putText(display_frame, rounds_text, (w - 220, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, display_color, 2)
                                
                                # Add "COMPLETE!" indicator when done
                                if sets >= target_sets:
                                    cv2.putText(display_frame, "COMPLETE!", (w - 220, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                            else:
                                # Rep-based exercise
                                reps = rep_state['reps']
                                target_reps = rep_state['target_reps']
                                sets = rep_state['sets']
                                target_sets = rep_state['target_sets']
                                
                                reps_text = f"Reps: {reps}/{target_reps}"
                                sets_text = f"Sets: {sets}/{target_sets}"
                                state_text = f"State: {rep_state['state']}"
                                
                                # Check if exercise complete
                                is_complete = sets >= target_sets
                                
                                # Rep state color coding
                                state_color = (0, 255, 255)  # Yellow for WAITING
                                if rep_state['state'] == 'DOWN':
                                    state_color = (0, 0, 255)  # Red for DOWN
                                elif rep_state['state'] == 'UP':
                                    state_color = (0, 255, 0)  # Green for UP
                                
                                cv2.putText(display_frame, reps_text, (w - 220, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                                cv2.putText(display_frame, sets_text, (w - 220, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                                
                                # Show state or COMPLETE indicator
                                if is_complete:
                                    cv2.putText(display_frame, "COMPLETE!", (w - 220, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                                else:
                                    cv2.putText(display_frame, state_text, (w - 220, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, state_color, 2)
                        
                        # REMOVED: Status indicator boxes that were covering content
                        # REMOVED: AI Coach caption text that was redundant with TTS
                    else:
                        # No AI analysis - show simplified header
                        cv2.putText(display_frame, "DNN: " + ("ON" if processing.use_dnn_correction else "OFF"), (w - 100, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                    
                    # Send to video processor (for backward compatibility)
                    video_processor.update_frame(display_frame)
                    
                    # Send via WebSocket to server
                    ws_sender.send_video_frame(display_frame)
                    
                    # Show local window if enabled
                    if args.show_window:
                        cv2.imshow('Fluxwell Capture - Press N:Next P:Prev R:Reset Q:Quit', display_frame)
                else:
                    # No world landmarks but has pose - add basic overlay and send
                    h, w = image.shape[:2]
                    cv2.rectangle(image, (0, 0), (w, 60), (0, 0, 0), -1)
                    cv2.putText(image, "Real-Time Pose Detection", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                    ws_sender.send_video_frame(image)
                    if args.show_window:
                        cv2.imshow('Fluxwell Capture - Press N:Next P:Prev R:Reset Q:Quit', image)
            else:
                # No landmarks at all - add overlay and send raw frame
                h, w = frame.shape[:2]
                overlay_frame = frame.copy()
                cv2.rectangle(overlay_frame, (0, 0), (w, 60), (0, 0, 0), -1)
                cv2.putText(overlay_frame, "Waiting for pose detection...", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                ws_sender.send_video_frame(overlay_frame)
                if args.show_window:
                    cv2.imshow('Fluxwell Capture - Press N:Next P:Prev R:Reset Q:Quit', overlay_frame)
            
            # Check for keyboard commands if window is shown
            key_pressed = None
            if args.show_window:
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    print("\n>>> Quit key pressed, exiting...")
                    break
                elif key == ord('n'):
                    key_pressed = 'next'
                    print("\n>>> [KEYBOARD] Next exercise")
                elif key == ord('p'):
                    key_pressed = 'previous'
                    print("\n>>> [KEYBOARD] Previous exercise")
                elif key == ord('r'):
                    key_pressed = 'reset'
                    print("\n>>> [KEYBOARD] Reset reps")
            
            # Process keyboard command immediately
            if key_pressed and ai_analyzer:
                if key_pressed == 'next':
                    ai_analyzer.switch_exercise(1)
                elif key_pressed == 'previous':
                    ai_analyzer.switch_exercise(-1)
                elif key_pressed == 'reset':
                    ai_analyzer.reset_reps()
            
            # Check for commands from frontend (every few frames to optimize)
            if frame_count % 5 == 0:  # Check every 5 frames instead of every frame
                command = ws_sender.get_command()
                if command and ai_analyzer:
                    print(f"\n>>> [FRONTEND] Processing command: {command}")
                    if command == 'next':
                        ai_analyzer.switch_exercise(1)
                    elif command == 'previous':
                        ai_analyzer.switch_exercise(-1)
                    elif command == 'reset':
                        ai_analyzer.reset_reps()
            
            # Small delay to prevent CPU overload (unless window shown, waitKey handles it)
            if not args.show_window:
                time.sleep(0.001)
    
    # Cleanup
    ws_sender.stop()
    cap.release()
    
    # Close any OpenCV windows
    if args.show_window:
        cv2.destroyAllWindows()
    
    # Close loop log if it exists
    try:
        if 'loop_log' in locals():
            loop_log.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Capture system stopped cleanly\n")
            loop_log.close()
    except:
        pass


def generate_mock_pose_data(frame_count):
    """
    Generate mock pose keypoints that simulate realistic human movement
    """
    import math

    # Create smooth oscillating motion for different body parts
    time_factor = frame_count * 0.1

    # Base pose (standing position)
    base_pose = {
        'nose': [0, -0.1, 0],
        'left_eye': [-0.02, -0.12, 0],
        'right_eye': [0.02, -0.12, 0],
        'left_ear': [-0.05, -0.1, 0],
        'right_ear': [0.05, -0.1, 0],
        'left_shoulder': [-0.15, -0.05, 0],
        'right_shoulder': [0.15, -0.05, 0],
        'left_elbow': [-0.25, 0.05, 0],
        'right_elbow': [0.25, 0.05, 0],
        'left_wrist': [-0.35, 0.15, 0],
        'right_wrist': [0.35, 0.15, 0],
        'left_hip': [-0.1, 0.3, 0],
        'right_hip': [0.1, 0.3, 0],
        'left_knee': [-0.12, 0.6, 0],
        'right_knee': [0.12, 0.6, 0],
        'left_ankle': [-0.1, 0.9, 0],
        'right_ankle': [0.1, 0.9, 0],
    }

    # Add some movement animation
    # Arms swinging slightly
    arm_swing = math.sin(time_factor) * 0.05
    base_pose['left_elbow'][0] += arm_swing
    base_pose['left_wrist'][0] += arm_swing * 1.5
    base_pose['right_elbow'][0] -= arm_swing
    base_pose['right_wrist'][0] -= arm_swing * 1.5

    # Subtle breathing motion
    breath = math.sin(time_factor * 2) * 0.01
    base_pose['left_shoulder'][1] += breath
    base_pose['right_shoulder'][1] += breath
    base_pose['left_hip'][1] -= breath
    base_pose['right_hip'][1] -= breath

    # Head slight movement
    head_tilt = math.sin(time_factor * 0.5) * 0.02
    base_pose['nose'][0] += head_tilt
    base_pose['left_eye'][0] += head_tilt
    base_pose['right_eye'][0] += head_tilt

    return base_pose


if __name__ == "__main__":
    main()
