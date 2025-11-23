/**
 * Movement Analysis Service
 * Handles API calls to control the AI movement analysis capture system
 */

const API_BASE = 'http://localhost:8000/api/movement';

export interface CaptureStatus {
  status: string;
  message?: string;
  pid?: number;
}

export interface MovementStatus {
  keypoint_clients_count: number;
  video_clients_count: number;
  capture_process_running: boolean;
  capture_process_pid: number | null;
  has_latest_keypoints: boolean;
  has_latest_frame: boolean;
  keypoint_update_count: number;
  video_frame_count: number;
}

/**
 * Start the capture system
 */
export const startCapture = async (): Promise<CaptureStatus> => {
  try {
    const response = await fetch(`${API_BASE}/capture/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start capture: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting capture:', error);
    throw error;
  }
};

/**
 * Stop the capture system
 */
export const stopCapture = async (): Promise<CaptureStatus> => {
  try {
    const response = await fetch(`${API_BASE}/capture/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to stop capture: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error stopping capture:', error);
    throw error;
  }
};

/**
 * Get the status of the movement analysis system
 */
export const getMovementStatus = async (): Promise<MovementStatus> => {
  try {
    const response = await fetch(`${API_BASE}/status`);

    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting movement status:', error);
    throw error;
  }
};

/**
 * Check if the capture system is running
 */
export const isCaptureRunning = async (): Promise<boolean> => {
  try {
    const status = await getMovementStatus();
    return status.capture_process_running;
  } catch (error) {
    console.error('Error checking capture status:', error);
    return false;
  }
};

