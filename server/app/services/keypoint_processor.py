import time
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class KeypointProcessor:
    """
    Processes and manages keypoint data from the capture system
    """
    
    def __init__(self):
        self.latest_keypoints: Optional[Dict[str, Any]] = None
        self.last_update_time: float = 0
        self.update_count: int = 0
        
    def update_keypoints(self, data: Dict[str, Any]) -> None:
        """
        Update the latest keypoints data
        
        Args:
            data: Dictionary containing keypoint data
        """
        self.latest_keypoints = data
        self.last_update_time = time.time()
        self.update_count += 1
        
        if self.update_count % 100 == 0:
            logger.info(f"Keypoint updates: {self.update_count}, "
                       f"Time since last: {time.time() - self.last_update_time:.3f}s, "
                       f"Keypoint count: {len(data)}")
    
    def get_latest_keypoints(self) -> Optional[Dict[str, Any]]:
        """
        Get the most recent keypoint data
        
        Returns:
            Dictionary of keypoints or None if no data available
        """
        return self.latest_keypoints
    
    def clear(self) -> None:
        """Clear stored keypoint data"""
        self.latest_keypoints = None
        self.last_update_time = 0


# Global instance to be accessed from capture script
_processor_instance: Optional[KeypointProcessor] = None


def get_keypoint_processor() -> KeypointProcessor:
    """Get or create the global KeypointProcessor instance"""
    global _processor_instance
    if _processor_instance is None:
        _processor_instance = KeypointProcessor()
    return _processor_instance


def update_keypoints_global(data: Dict[str, Any]) -> None:
    """
    Global function to update keypoints from external scripts
    This is called from the capture script
    
    Args:
        data: Dictionary containing keypoint data
    """
    processor = get_keypoint_processor()
    processor.update_keypoints(data)
