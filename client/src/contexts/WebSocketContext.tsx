import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';

interface KeypointData {
  dnn_enabled?: boolean;
  timestamp?: number;
  [key: string]: number[] | boolean | number | undefined;
}

interface WebSocketContextType {
  keypoints: KeypointData | null;
  videoFrame: string | null;
  isKeypointsConnected: boolean;
  isVideoConnected: boolean;
  reconnectKeypoints: () => void;
  reconnectVideo: () => void;
  sendExerciseCommand: (command: 'next' | 'previous' | 'reset') => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const [keypoints, setKeypoints] = useState<KeypointData | null>(null);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);
  const [isKeypointsConnected, setIsKeypointsConnected] = useState(false);
  const [isVideoConnected, setIsVideoConnected] = useState(false);
  
  // Performance optimization: Track last update times to throttle state updates
  const lastKeypointUpdateRef = useRef<number>(0);
  const lastVideoUpdateRef = useRef<number>(0);
  
  const keypointsWsRef = useRef<WebSocket | null>(null);
  const videoWsRef = useRef<WebSocket | null>(null);
  const keypointsReconnectTimeoutRef = useRef<number | null>(null);
  const videoReconnectTimeoutRef = useRef<number | null>(null);
  const isKeypointsIntentionalCloseRef = useRef(false);
  const isVideoIntentionalCloseRef = useRef(false);
  const videoFrameRef = useRef<string | null>(null);
  const frameCountRef = useRef(0);
  const mountedRef = useRef(true);

  const connectKeypoints = () => {
    console.log('🔌 Attempting to connect to keypoints WebSocket...');

    // Clear any existing reconnect timeout
    if (keypointsReconnectTimeoutRef.current) {
      clearTimeout(keypointsReconnectTimeoutRef.current);
      keypointsReconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (keypointsWsRef.current) {
      isKeypointsIntentionalCloseRef.current = true;
      keypointsWsRef.current.close();
      keypointsWsRef.current = null;
    }

    try {
      const ws = new WebSocket('ws://localhost:8000/api/movement/ws/keypoints');
      console.log('🔌 Created keypoints WebSocket connection');

      ws.onopen = () => {
        console.log('✅ Keypoints WebSocket connected successfully');
        setIsKeypointsConnected(true);
        isKeypointsIntentionalCloseRef.current = false;
      };
      
      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          
          // Throttle updates to max 30Hz (~33ms) to prevent excessive re-renders while maintaining responsiveness
          const now = Date.now();
          if (now - lastKeypointUpdateRef.current >= 33) {
            setKeypoints(data);
            lastKeypointUpdateRef.current = now;
          }
        } catch (error) {
          // Silently handle parse errors to avoid console spam
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ Keypoints WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('🔌 Keypoints WebSocket closed:', event.code, event.reason);
        setIsKeypointsConnected(false);

        // Only reconnect if not intentionally closed
        if (!isKeypointsIntentionalCloseRef.current) {
          console.log('🔄 Reconnecting keypoints WebSocket in 3 seconds...');
          keypointsReconnectTimeoutRef.current = setTimeout(connectKeypoints, 3000);
        }
      };
      
      keypointsWsRef.current = ws;
    } catch (error) {
      setIsKeypointsConnected(false);
      keypointsReconnectTimeoutRef.current = setTimeout(connectKeypoints, 3000);
    }
  };

  const connectVideo = () => {
    // Clear any existing reconnect timeout
    if (videoReconnectTimeoutRef.current) {
      clearTimeout(videoReconnectTimeoutRef.current);
      videoReconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (videoWsRef.current) {
      isVideoIntentionalCloseRef.current = true;
      videoWsRef.current.close();
      videoWsRef.current = null;
    }

    try {
      const ws = new WebSocket('ws://localhost:8000/api/movement/ws/video');
      
      ws.onopen = () => {
        console.log('✓ Video WebSocket connected to ws://localhost:8000/api/movement/ws/video');
        setIsVideoConnected(true);
        isVideoIntentionalCloseRef.current = false;
      };
      
      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          if (data.image) {
            frameCountRef.current += 1;
            
            // Throttle video updates to max 24fps (~42ms) for optimal performance/quality balance
            const now = Date.now();
            if (now - lastVideoUpdateRef.current >= 42) {
              const frameData = `data:image/jpeg;base64,${data.image}`;
              videoFrameRef.current = frameData;
              setVideoFrame(frameData);
              lastVideoUpdateRef.current = now;
              
              // Log every 30 frames instead of continuously
              if (frameCountRef.current % 30 === 1) {
                console.log(`✓ Video frame ${frameCountRef.current} received, size: ${data.image.length}`);
              }
            }
          }
        } catch (error) {
          // Silently handle parse errors
        }
      };
      
      ws.onerror = (error) => {
        console.error('✗ Video WebSocket error:', error);
      };
      
      ws.onclose = () => {
        setIsVideoConnected(false);
        
        // Only reconnect if not intentionally closed
        if (!isVideoIntentionalCloseRef.current) {
          videoReconnectTimeoutRef.current = setTimeout(connectVideo, 3000);
        }
      };
      
      videoWsRef.current = ws;
    } catch (error) {
      setIsVideoConnected(false);
      videoReconnectTimeoutRef.current = setTimeout(connectVideo, 3000);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    connectKeypoints();
    connectVideo();

    return () => {
      mountedRef.current = false;
      
      // Mark as intentional close to prevent reconnection
      isKeypointsIntentionalCloseRef.current = true;
      isVideoIntentionalCloseRef.current = true;
      
      // Clear any pending reconnection timeouts
      if (keypointsReconnectTimeoutRef.current) {
        clearTimeout(keypointsReconnectTimeoutRef.current);
      }
      if (videoReconnectTimeoutRef.current) {
        clearTimeout(videoReconnectTimeoutRef.current);
      }
      
      // Close connections
      if (keypointsWsRef.current?.readyState === WebSocket.OPEN) {
        keypointsWsRef.current.close();
      }
      if (videoWsRef.current?.readyState === WebSocket.OPEN) {
        videoWsRef.current.close();
      }
    };
  }, []);

  const reconnectKeypoints = () => {
    isKeypointsIntentionalCloseRef.current = true;
    if (keypointsWsRef.current) {
      keypointsWsRef.current.close();
    }
    connectKeypoints();
  };

  const reconnectVideo = () => {
    isVideoIntentionalCloseRef.current = true;
    if (videoWsRef.current) {
      videoWsRef.current.close();
    }
    connectVideo();
  };

  const sendExerciseCommand = (command: 'next' | 'previous' | 'reset') => {
    if (keypointsWsRef.current?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type: 'command', command });
      keypointsWsRef.current.send(message);
      console.log(`📤 Sent ${command} command`);
    } else {
      console.warn('⚠ Cannot send command: WebSocket not connected');
    }
  };

  return (
    <WebSocketContext.Provider
      value={{
        keypoints,
        videoFrame,
        isKeypointsConnected,
        isVideoConnected,
        reconnectKeypoints,
        reconnectVideo,
        sendExerciseCommand,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};
