"""
Configuration module for Fluxwell application
"""

from .movement_analysis_config import (
    KEYPOINT_BROADCAST_RATE,
    VIDEO_BROADCAST_FPS,
    VIDEO_JPEG_QUALITY,
    CAPTURE_AUTO_START,
    AI_CONFIG,
    validate_config,
)

__all__ = [
    'KEYPOINT_BROADCAST_RATE',
    'VIDEO_BROADCAST_FPS',
    'VIDEO_JPEG_QUALITY',
    'CAPTURE_AUTO_START',
    'AI_CONFIG',
    'validate_config',
]

