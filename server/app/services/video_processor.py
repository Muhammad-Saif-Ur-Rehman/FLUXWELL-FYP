import cv2
import base64
import time
from typing import Optional
import numpy as np
import logging

logger = logging.getLogger(__name__)


class VideoProcessor:
    """
    Processes and manages video frame data from the capture system
    """
    
    def __init__(self):
        self.latest_frame: Optional[str] = None
        self.latest_frame_time: float = 0
        self.frame_count: int = 0
        
    def update_frame(self, frame: np.ndarray) -> None:
        """
        Update the latest video frame
        
        Args:
            frame: A numpy array (BGR) representing the frame
        """
        try:
            # Encode frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            
            # Convert to base64 for sending over WebSocket
            self.latest_frame = base64.b64encode(buffer).decode('utf-8')
            self.latest_frame_time = time.time()
            self.frame_count += 1
            
            if self.frame_count % 100 == 0:
                logger.info(f"Video frames processed: {self.frame_count}")
                
        except Exception as e:
            logger.error(f"Error encoding video frame: {e}")
    
    def get_latest_frame(self) -> Optional[str]:
        """
        Get the most recent video frame
        
        Returns:
            Base64 encoded JPEG string or None if no frame available
        """
        return self.latest_frame
    
    def clear(self) -> None:
        """Clear stored frame data"""
        self.latest_frame = None
        self.latest_frame_time = 0


# Global instance to be accessed from capture script
_processor_instance: Optional[VideoProcessor] = None


def get_video_processor() -> VideoProcessor:
    """Get or create the global VideoProcessor instance"""
    global _processor_instance
    if _processor_instance is None:
        _processor_instance = VideoProcessor()
    return _processor_instance


def update_frame_global(frame: np.ndarray) -> None:
    """
    Global function to update video frame from external scripts
    This is called from the capture script
    
    Args:
        frame: A numpy array (BGR) representing the frame
    """
    processor = get_video_processor()
    processor.update_frame(frame)
