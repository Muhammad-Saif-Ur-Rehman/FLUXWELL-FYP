"""
Configuration for AI Movement Analysis Module
Centralized settings for easy customization
"""

# WebSocket Configuration
WEBSOCKET_PING_INTERVAL = 20  # seconds
WEBSOCKET_PING_TIMEOUT = 10   # seconds
WEBSOCKET_CONNECTION_TIMEOUT = 5.0  # seconds

# Broadcast Rates (Hz / FPS)
KEYPOINT_BROADCAST_RATE = 50  # 50Hz (20ms between updates)
VIDEO_BROADCAST_FPS = 60      # 60fps (~16ms between frames)

# Video Processing
VIDEO_JPEG_QUALITY = 80       # 0-100, higher = better quality but larger size
VIDEO_FRAME_WIDTH = 640       # Resize width (None = no resize)
VIDEO_FRAME_HEIGHT = 480      # Resize height (None = no resize)

# Logging
LOG_FRAME_INTERVAL = 100      # Log every N frames
LOG_LEVEL = "INFO"            # DEBUG, INFO, WARNING, ERROR

# Capture System
CAPTURE_AUTO_START = True     # Auto-start capture on server startup
CAPTURE_STARTUP_DELAY = 2     # Seconds to wait before starting capture
CAPTURE_AI_ANALYSIS = True    # Enable AI analysis in capture

# Performance
MAX_CLIENTS_PER_ENDPOINT = 10 # Maximum simultaneous clients per WebSocket endpoint
BUFFER_SIZE = 1024 * 1024     # 1MB buffer for WebSocket messages

# Error Handling
MAX_RECONNECT_ATTEMPTS = 5    # Max reconnection attempts for capture script
RECONNECT_DELAY = 2           # Seconds between reconnection attempts
CLIENT_TIMEOUT = 30           # Seconds before considering client inactive

# AI Analysis (passed to capture script)
AI_CONFIG = {
    "reps_target": 10,
    "sets_target": 3,
    "rest_time_between_sets": 30,
    "rest_time_before_next_exercise": 30,
    "rep_cooldown_frames": 15,
}

# CORS Configuration
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

# Development Mode
DEBUG_MODE = False            # Enable verbose logging and debug features
MOCK_CAMERA = False           # Use mock camera data (for testing without camera)

# Performance Tuning
ENABLE_COMPRESSION = True     # Enable GZip compression for HTTP responses
COMPRESSION_MIN_SIZE = 1000   # Minimum size (bytes) to compress

# File Paths
CAPTURE_SCRIPT_PATH = "app/scripts/capture.py"
AI_MODEL_PATH = "app/ai_models/"
EXERCISES_JSON_PATH = "app/scripts/exercises.json"


def get_websocket_url(host: str = "localhost", port: int = 8000) -> str:
    """Generate WebSocket URL for capture script"""
    return f"ws://{host}:{port}"


def get_broadcast_sleep_time(rate: int) -> float:
    """Calculate sleep time based on broadcast rate"""
    return 1.0 / rate if rate > 0 else 0.02


def validate_config():
    """Validate configuration values"""
    assert 1 <= KEYPOINT_BROADCAST_RATE <= 120, "Keypoint rate must be 1-120 Hz"
    assert 1 <= VIDEO_BROADCAST_FPS <= 120, "Video FPS must be 1-120"
    assert 0 < VIDEO_JPEG_QUALITY <= 100, "JPEG quality must be 1-100"
    assert MAX_CLIENTS_PER_ENDPOINT > 0, "Max clients must be positive"
    assert CAPTURE_STARTUP_DELAY >= 0, "Startup delay cannot be negative"
    print("✅ Configuration validated successfully")


# Validate on import
if __name__ != "__main__":
    try:
        validate_config()
    except AssertionError as e:
        print(f"⚠️ Configuration validation failed: {e}")

