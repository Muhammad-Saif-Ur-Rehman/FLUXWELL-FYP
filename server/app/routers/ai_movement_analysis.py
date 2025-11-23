"""
AI Movement Analysis Router
Handles WebSocket connections for real-time pose tracking and video streaming
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set
import asyncio
import json
import logging
import threading
import subprocess
import sys
import os

# Import processing modules
from app.services.keypoint_processor import KeypointProcessor
from app.services.video_processor import VideoProcessor

# Import configuration
try:
    from app.config.movement_analysis_config import (
        KEYPOINT_BROADCAST_RATE,
        VIDEO_BROADCAST_FPS,
        LOG_FRAME_INTERVAL,
        get_broadcast_sleep_time,
    )
except ImportError:
    # Fallback to default values if config not found
    KEYPOINT_BROADCAST_RATE = 50
    VIDEO_BROADCAST_FPS = 60
    LOG_FRAME_INTERVAL = 100
    
    def get_broadcast_sleep_time(rate):
        return 1.0 / rate

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/movement", tags=["AI Movement Analysis"])

# Initialize processors
keypoint_processor = KeypointProcessor()
video_processor = VideoProcessor()

# WebSocket connection managers
keypoint_clients: Set[WebSocket] = set()
video_clients: Set[WebSocket] = set()
capture_keypoints_ws: WebSocket = None

# Global capture process and reference counter
capture_process = None
capture_start_lock = threading.Lock()
active_practice_sessions = 0  # Track number of active /practice sessions


# ============================================================================
# CAPTURE ENDPOINTS (Receiving data FROM capture script)
# ============================================================================

@router.websocket("/ws/capture/keypoints")
async def websocket_capture_keypoints(websocket: WebSocket):
    """
    Endpoint for capture script to send keypoints TO the server
    """
    global capture_keypoints_ws
    await websocket.accept()
    capture_keypoints_ws = websocket
    logger.info("✓ Capture script connected for keypoints")
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                keypoints_data = json.loads(data)
                keypoint_processor.update_keypoints(keypoints_data)
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in keypoints: {e}")
    except WebSocketDisconnect:
        logger.info("Capture script disconnected from keypoints")
        capture_keypoints_ws = None
    except Exception as e:
        logger.error(f"Error in capture keypoints websocket: {e}")
        capture_keypoints_ws = None


@router.websocket("/ws/capture/video")
async def websocket_capture_video(websocket: WebSocket):
    """
    Endpoint for capture script to send video frames TO the server
    """
    await websocket.accept()
    logger.info("✓ Capture script connected for video")
    frame_receive_count = 0
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                frame_data = json.loads(data)
                if "image" in frame_data:
                    video_processor.latest_frame = frame_data["image"]
                    video_processor.latest_frame_time = frame_data.get("timestamp", 0)
                    frame_receive_count += 1
                    if frame_receive_count % LOG_FRAME_INTERVAL == 0:
                        logger.info(f"✓ Received {frame_receive_count} video frames from capture script")
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in video: {e}")
    except WebSocketDisconnect:
        logger.info(f"Capture script disconnected from video (received {frame_receive_count} frames total)")
    except Exception as e:
        logger.error(f"Error in capture video websocket: {e}")


# ============================================================================
# FRONTEND ENDPOINTS (Sending data TO frontend clients)
# ============================================================================

@router.websocket("/ws/keypoints")
async def websocket_keypoints(websocket: WebSocket):
    """
    Endpoint for frontend clients to receive keypoints FROM the server
    Also handles commands FROM frontend (next/previous/reset)
    """
    await websocket.accept()
    keypoint_clients.add(websocket)
    logger.info(f"✓ Frontend keypoint client connected. Total clients: {len(keypoint_clients)}")
    
    try:
        # Send initial data if available
        if keypoint_processor.latest_keypoints:
            await websocket.send_json(keypoint_processor.latest_keypoints)
        
        # Handle incoming messages (commands from frontend)
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                # Parse command from frontend
                try:
                    message = json.loads(data)
                    if message.get('type') == 'command':
                        command = message.get('command')
                        logger.info(f"📤 Received command from frontend: {command}")
                        
                        # Forward command to capture script
                        if capture_keypoints_ws:
                            await capture_keypoints_ws.send_json(message)
                            logger.info(f"✓ Forwarded command to capture script: {command}")
                        else:
                            logger.warning("⚠ Cannot forward command: capture script not connected")
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # No data received, continue
                pass
                
    except WebSocketDisconnect:
        logger.info("Frontend keypoint client disconnected")
    except Exception as e:
        logger.error(f"Error in keypoint websocket: {e}")
    finally:
        keypoint_clients.discard(websocket)
        logger.info(f"Keypoint client removed. Total clients: {len(keypoint_clients)}")


@router.websocket("/ws/video")
async def websocket_video(websocket: WebSocket):
    """
    Endpoint for frontend clients to receive video frames FROM the server
    """
    await websocket.accept()
    video_clients.add(websocket)
    logger.info(f"✓ Frontend video client connected. Total clients: {len(video_clients)}")
    
    try:
        # Send initial frame if available
        if video_processor.latest_frame:
            await websocket.send_json({
                "image": video_processor.latest_frame,
                "timestamp": video_processor.latest_frame_time
            })
        
        # Keep connection alive (frontend only receives, doesn't send)
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                pass
                
    except WebSocketDisconnect:
        logger.info("Frontend video client disconnected")
    except Exception as e:
        logger.error(f"Error in video websocket: {e}")
    finally:
        video_clients.discard(websocket)
        logger.info(f"Video client removed. Total clients: {len(video_clients)}")


# ============================================================================
# BACKGROUND BROADCAST TASKS
# ============================================================================

async def broadcast_keypoints():
    """Broadcast keypoints to all connected frontend clients"""
    while True:
        if keypoint_clients and keypoint_processor.latest_keypoints:
            # Create a copy of clients to avoid issues with set modification during iteration
            clients_copy = keypoint_clients.copy()
            
            message = json.dumps(keypoint_processor.latest_keypoints)
            
            for client in clients_copy:
                try:
                    await client.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending to keypoint client: {e}")
                    keypoint_clients.discard(client)
        
        await asyncio.sleep(get_broadcast_sleep_time(KEYPOINT_BROADCAST_RATE))  # Configurable rate


async def broadcast_video():
    """Broadcast video frames to all connected frontend clients"""
    frame_count = 0
    logger.info("Video broadcast task started")
    
    while True:
        if video_clients and video_processor.latest_frame:
            clients_copy = video_clients.copy()
            
            frame_data = {
                "image": video_processor.latest_frame,
                "timestamp": video_processor.latest_frame_time
            }
            message = json.dumps(frame_data)
            
            for client in clients_copy:
                try:
                    await client.send_text(message)
                    frame_count += 1
                    if frame_count % LOG_FRAME_INTERVAL == 0:
                        logger.info(f"✓ Broadcasted {frame_count} video frames to {len(clients_copy)} client(s)")
                except Exception as e:
                    logger.error(f"Error sending to video client: {e}")
                    video_clients.discard(client)
        elif not video_processor.latest_frame and frame_count == 0:
            # Log once when waiting for first frame
            logger.info("Waiting for video frames from capture script...")
            frame_count = -1  # Prevent repeated logging
        
        await asyncio.sleep(get_broadcast_sleep_time(VIDEO_BROADCAST_FPS))  # Configurable FPS


# ============================================================================
# CAPTURE SYSTEM MANAGEMENT
# ============================================================================

def start_capture_system():
    """Start the capture system in a separate process"""
    global capture_process
    try:
        logger.info("🚀 Starting capture system automatically...")
        
        # Get the path to capture.py
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        capture_script = os.path.join(script_dir, "scripts", "capture.py")
        
        logger.info(f"📂 Capture script path: {capture_script}")
        
        if not os.path.exists(capture_script):
            logger.error(f"❌ Capture script not found at: {capture_script}")
            return
        
        # Set environment variable to force UTF-8 encoding
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        
        # Start the capture system with AI analysis enabled and demo mode fallback
        capture_process = subprocess.Popen(
            [sys.executable, capture_script, "--ai-analysis", "--demo-mode"],
            cwd=script_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,  # Hide console window on Windows
        )
        
        logger.info(f"✅ Capture system started (PID: {capture_process.pid})")
        logger.info("  -> Capture will connect to backend in ~2 seconds")
        logger.info("  -> Video feed will appear in frontend when camera is detected")
        
        # Monitor the process and stream logs
        def stream_output():
            try:
                for line in iter(capture_process.stdout.readline, b''):
                    if line:
                        decoded = line.decode('utf-8', errors='ignore').strip()
                        if decoded:
                            logger.info(f"[CAPTURE] {decoded}")
            except Exception as e:
                logger.error(f"Error reading capture stdout: {e}")
        
        def stream_errors():
            try:
                for line in iter(capture_process.stderr.readline, b''):
                    if line:
                        decoded = line.decode('utf-8', errors='ignore').strip()
                        if decoded and not decoded.startswith('WARNING'):
                            logger.warning(f"[CAPTURE] {decoded}")
            except Exception as e:
                logger.error(f"Error reading capture stderr: {e}")
        
        def monitor_capture():
            try:
                returncode = capture_process.wait()
                if returncode != 0:
                    logger.error(f"❌ [CAPTURE] Process exited with code {returncode}")
                else:
                    logger.info(f"✓ [CAPTURE] Process exited normally")
            except Exception as e:
                logger.error(f"Error monitoring capture process: {e}")
        
        # Start monitoring threads
        threading.Thread(target=stream_output, daemon=True).start()
        threading.Thread(target=stream_errors, daemon=True).start()
        threading.Thread(target=monitor_capture, daemon=True).start()
        
    except Exception as e:
        logger.error(f"❌ Failed to start capture system: {e}")
        import traceback
        logger.error(traceback.format_exc())


def stop_capture_system():
    """Stop the capture system"""
    global capture_process
    if capture_process:
        try:
            logger.info("🛑 Stopping capture system...")
            capture_process.terminate()
            capture_process.wait(timeout=5)
            logger.info("✓ Capture system stopped")
        except subprocess.TimeoutExpired:
            logger.warning("⚠️  Capture process didn't stop gracefully, forcing kill...")
            try:
                capture_process.kill()
                capture_process.wait(timeout=2)
                logger.info("✓ Capture system killed")
            except Exception as e:
                logger.error(f"Error killing capture process: {e}")
        except Exception as e:
            logger.error(f"Error stopping capture system: {e}")
            try:
                capture_process.kill()
            except:
                pass
        finally:
            # Clear keypoints and video data
            keypoint_processor.clear()
            video_processor.clear()
            capture_process = None


# ============================================================================
# STARTUP/SHUTDOWN HELPERS (Called from main.py)
# ============================================================================

async def startup_ai_movement_analysis():
    """Start background tasks (but NOT capture system) - called from main app startup"""
    logger.info("🚀 Starting AI Movement Analysis module...")
    asyncio.create_task(broadcast_keypoints())
    asyncio.create_task(broadcast_video())
    logger.info("✓ Background broadcast tasks started")
    logger.info("ℹ️  Capture system will start when /practice route is visited")


async def shutdown_ai_movement_analysis():
    """Cleanup on shutdown - called from main app shutdown"""
    logger.info("🛑 Shutting down AI Movement Analysis module...")
    
    # Stop capture system
    stop_capture_system()
    
    # Close all websocket connections
    for client in keypoint_clients.copy():
        await client.close()
    for client in video_clients.copy():
        await client.close()
    
    logger.info("✓ AI Movement Analysis module shut down")


# ============================================================================
# REST API ENDPOINTS
# ============================================================================

@router.get("/health")
async def health():
    """Health check endpoint"""
    # Check if capture system needs restart
    capture_should_be_running = active_practice_sessions > 0
    capture_actually_running = capture_process is not None and capture_process.poll() is None

    # Auto-restart if needed
    if capture_should_be_running and not capture_actually_running:
        logger.warning("⚠️  Capture system should be running but isn't. Attempting restart...")
        try:
            start_capture_system()
            logger.info("✅ Capture system restarted automatically")
        except Exception as e:
            logger.error(f"❌ Failed to restart capture system: {e}")

    return {
        "status": "healthy",
        "keypoint_clients": len(keypoint_clients),
        "video_clients": len(video_clients),
        "capture_running": capture_process is not None and capture_process.poll() is None,
        "active_sessions": active_practice_sessions,
        "capture_should_run": capture_should_be_running
    }


@router.get("/status")
async def status():
    """Get detailed status of the movement analysis system"""
    return {
        "keypoint_clients_count": len(keypoint_clients),
        "video_clients_count": len(video_clients),
        "capture_process_running": capture_process is not None and capture_process.poll() is None,
        "capture_process_pid": capture_process.pid if capture_process else None,
        "has_latest_keypoints": keypoint_processor.latest_keypoints is not None,
        "has_latest_frame": video_processor.latest_frame is not None,
        "keypoint_update_count": keypoint_processor.update_count,
        "video_frame_count": video_processor.frame_count
    }


@router.post("/capture/start")
async def start_capture():
    """Start the capture system (called when user visits /practice route)"""
    global capture_process, active_practice_sessions
    
    # Increment session counter
    active_practice_sessions += 1
    logger.info(f"📊 Active practice sessions: {active_practice_sessions}")
    
    # Check if already running
    if capture_process and capture_process.poll() is None:
        logger.info("ℹ️  Capture system already running, reusing existing instance")
        return {
            "status": "already_running",
            "message": "Capture system is already active",
            "pid": capture_process.pid,
            "active_sessions": active_practice_sessions
        }
    
    # Use lock to prevent race conditions
    with capture_start_lock:
        # Double-check after acquiring lock
        if capture_process and capture_process.poll() is None:
            logger.info("ℹ️  Capture system already started by another request")
            return {
                "status": "already_running",
                "message": "Capture system is already active",
                "pid": capture_process.pid,
                "active_sessions": active_practice_sessions
            }
        
        # Start in background thread
        def launch():
            import time
            time.sleep(1)  # Small delay for stability
            try:
                start_capture_system()
                logger.info("✅ Capture system started successfully")
            except Exception as e:
                logger.error(f"❌ Failed to start capture system: {e}")
                # Reset session counter if capture fails
                global active_practice_sessions
                if active_practice_sessions > 0:
                    active_practice_sessions -= 1

        threading.Thread(target=launch, daemon=True).start()

        logger.info(f"✅ Capture system start requested (session #{active_practice_sessions})")
        return {
            "status": "starting",
            "message": "Capture system is starting...",
            "active_sessions": active_practice_sessions
        }


@router.post("/capture/stop")
async def stop_capture():
    """Stop the capture system (called when user leaves /practice route)"""
    global capture_process, active_practice_sessions
    
    # Decrement session counter
    if active_practice_sessions > 0:
        active_practice_sessions -= 1
    
    logger.info(f"📊 Active practice sessions: {active_practice_sessions}")
    
    # Only stop if no more active sessions
    if active_practice_sessions > 0:
        logger.info(f"ℹ️  Keeping capture system running ({active_practice_sessions} active session(s))")
        return {
            "status": "kept_running",
            "message": f"Capture system kept running for other active sessions",
            "active_sessions": active_practice_sessions
        }
    
    if not capture_process or capture_process.poll() is not None:
        logger.info("ℹ️  Capture system not running")
        return {
            "status": "not_running",
            "message": "Capture system is not active",
            "active_sessions": 0
        }
    
    # Stop the capture system
    stop_capture_system()
    
    logger.info("✅ Capture system stopped (no active sessions)")
    return {
        "status": "stopped",
        "message": "Capture system has been stopped",
        "active_sessions": 0
    }

