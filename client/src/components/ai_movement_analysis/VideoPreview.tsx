import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import AIFeedback from './AIFeedback';

const VideoPreview = () => {
  const { videoFrame, isKeypointsConnected, isVideoConnected, keypoints, sendExerciseCommand } = useWebSocket();
  const [lastCommandTime, setLastCommandTime] = useState(0);
  const COMMAND_COOLDOWN = 500; // 500ms cooldown between commands
  
  const handleCommand = useCallback((command: 'next' | 'previous' | 'reset') => {
    const now = Date.now();
    if (now - lastCommandTime < COMMAND_COOLDOWN) {
      console.log('Command blocked: cooldown active');
      return;
    }
    setLastCommandTime(now);
    sendExerciseCommand(command);
  }, [lastCommandTime, sendExerciseCommand, COMMAND_COOLDOWN]);
  
  // Mount/unmount logging only
  useEffect(() => {
    console.log('📹 VideoPreview component MOUNTED');
    return () => console.log('📹 VideoPreview component UNMOUNTED');
  }, []);
  
  // Memoized AI and exercise data extraction for performance
  const exerciseData = useMemo(() => {
    const data = keypoints as any;
    return {
      aiActive: !!(data?.ai_feedback || data?.current_exercise),
      currentExercise: data?.current_exercise || 'No Exercise',
      aiErrors: data?.ai_errors || [],
      reps: data?.reps || 0,
      sets: data?.sets || 0,
      repState: data?.rep_state || '',
      targetReps: data?.target_reps || 10,
      targetSets: data?.target_sets || 3,
      isTimeBased: data?.is_time_based || false,
      elapsedTime: data?.elapsed_time || 0,
      targetTime: data?.target_time || 60,
      isResting: data?.is_resting || false,
      restRemaining: data?.rest_remaining || 0,
      exerciseRestRemaining: data?.exercise_rest_remaining || 0,
    };
  }, [keypoints]);

  const {
    aiActive,
    currentExercise,
    aiErrors,
    reps,
    sets,
    repState,
    targetReps,
    targetSets,
    isTimeBased,
    elapsedTime,
    targetTime,
    isResting,
    restRemaining,
    exerciseRestRemaining,
  } = exerciseData;

  return (
    <div className="bg-[#1a1a1a] border border-[#663333] rounded-lg p-4 glass-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#663333] flex-shrink-0">
        <h2 className="text-lg font-semibold text-[#EA2A2A]">📹 Live Feed</h2>
        {aiActive && (
          <div className="flex items-center gap-1 bg-[#EA2A2A]/20 border border-[#EA2A2A]/30 rounded px-2 py-1">
            <span className="animate-pulse text-sm">🤖</span>
            <span className="text-[#EA2A2A] text-xs font-medium">AI</span>
          </div>
        )}
      </div>

      {/* Scrollable Content Area - allows content to scroll while keeping buttons visible */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden mb-3 space-y-3">
        {/* Video Container */}
        <div className="relative flex-shrink-0">
          {videoFrame ? (
            <div className="relative bg-black rounded-lg overflow-hidden w-full aspect-video flex items-center justify-center">
              <img
                src={videoFrame}
                alt="MediaPipe Pose Detection"
                className="w-full h-full object-contain block rounded-lg"
                onError={(e) => {
                  console.error('❌ Image load ERROR:', e);
                  console.error('Failed src:', videoFrame?.substring(0, 100));
                }}
                onLoad={(e) => console.log('✅ Image LOADED successfully, dimensions:', (e.target as HTMLImageElement).naturalWidth, 'x', (e.target as HTMLImageElement).naturalHeight)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center bg-black rounded-lg border border-[#663333] text-center py-12 w-full aspect-video">
              <div className="text-6xl mb-4">📹</div>
              <div className="space-y-2">
                {isVideoConnected ? (
                  <>
                    <div className="text-gray-300 text-lg">Waiting for video stream...</div>
                    <div className="text-gray-500 text-sm">WebSocket connected, waiting for first frame...</div>
                    <div className="text-gray-600 text-xs">Check browser console (F12) for frame logs</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-300 text-lg">Camera Not Connected</div>
                    <div className="text-gray-500 text-sm mt-2">
                      Start capture: <code className="bg-gray-800 px-2 py-1 rounded text-xs">python app/scripts/capture.py --ai-analysis</code>
                    </div>
                    <div className="text-gray-500 text-sm">
                      Demo mode: <code className="bg-gray-800 px-2 py-1 rounded text-xs">--demo-mode</code>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status Container */}
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center justify-between p-2 bg-[#110E0E] border border-[#663333] rounded">
            <span className="text-gray-300 text-sm">Camera</span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isVideoConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className={`text-xs font-medium ${isVideoConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isVideoConnected ? 'Connected' : 'Disconnected'}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between p-2 bg-[#110E0E] border border-[#663333] rounded">
            <span className="text-gray-300 text-sm">Tracking</span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isKeypointsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className={`text-xs font-medium ${isKeypointsConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isKeypointsConnected ? 'Active' : 'Inactive'}
              </span>
            </span>
          </div>

          {aiActive && (
            <div className="flex items-center justify-between p-2 bg-[#110E0E] border border-[#663333] rounded">
              <span className="text-gray-300 text-sm">AI Coach</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-green-400 text-xs font-medium">Running</span>
              </span>
            </div>
          )}
        </div>

        {/* Rep Counter Display */}
        {aiActive && (
          <div className="bg-[#110E0E] border border-[#663333] rounded p-3">
            <div className="grid grid-cols-2 gap-2">
              {exerciseRestRemaining > 0 ? (
                <>
                  <div className="text-center">
                    <div className="text-green-400 font-bold text-sm">✓ COMPLETE</div>
                    <div className="text-gray-400 text-xs">Status</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[#EA2A2A] font-bold text-lg">{exerciseRestRemaining}s</div>
                    <div className="text-gray-400 text-xs">Next</div>
                  </div>
                </>
              ) : isResting && restRemaining > 0 ? (
                <>
                  <div className="text-center">
                    <div className="text-[#EA2A2A] font-bold text-lg">{restRemaining}s</div>
                    <div className="text-gray-400 text-xs">REST</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[#EA2A2A] font-bold text-lg">{sets}/{targetSets}</div>
                    <div className="text-gray-400 text-xs">Sets</div>
                  </div>
                </>
              ) : isTimeBased ? (
                <>
                  <div className="text-center">
                    <div className={`font-bold text-base ${sets >= targetSets ? 'text-green-400' : 'text-blue-400'}`}>
                      {Math.floor(elapsedTime)}s
                    </div>
                    <div className="text-gray-400 text-xs">Time</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold text-base ${sets >= targetSets ? 'text-green-400' : 'text-blue-400'}`}>
                      {sets}/{targetSets}
                    </div>
                    <div className="text-gray-400 text-xs">Rounds</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-white font-bold text-lg">{reps}/{targetReps}</div>
                    <div className="text-gray-400 text-xs">Reps</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-bold text-lg">{sets}/{targetSets}</div>
                    <div className="text-gray-400 text-xs">Sets</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Feedback Section - Collapsible */}
        {aiActive && (
          <div className="overflow-hidden">
            <AIFeedback />
          </div>
        )}
      </div>
      
      {/* Exercise Navigation Controls - ALWAYS VISIBLE - Fixed at bottom */}
      <div className="bg-[#1E1E1E] border border-white/10 rounded-lg p-4 flex-shrink-0 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-center gap-2 text-gray-400 text-xs font-medium mb-3">
          <span className="text-sm">🎮</span>
          <span>Exercise Controls</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
              isKeypointsConnected
                ? 'bg-[#EB4747] hover:bg-[#d13f3f] text-white cursor-pointer hover:shadow-lg active:scale-95'
                : 'bg-[#1E1E1E] border border-white/20 text-gray-500 cursor-not-allowed'
            }`}
            title="Previous Exercise"
            onClick={() => {
              console.log('🔄 Previous button clicked, connected:', isKeypointsConnected);
              if (isKeypointsConnected) {
                handleCommand('previous');
              }
            }}
            disabled={!isKeypointsConnected}
          >
            ⏮️ Prev
          </button>
          <button
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
              isKeypointsConnected
                ? 'bg-[#EB4747] hover:bg-[#d13f3f] text-white cursor-pointer hover:shadow-lg active:scale-95'
                : 'bg-[#1E1E1E] border border-white/20 text-gray-500 cursor-not-allowed'
            }`}
            title="Reset Current Exercise (Resets reps/sets or timer/rounds)"
            onClick={() => {
              console.log('🔄 Reset button clicked, connected:', isKeypointsConnected);
              if (isKeypointsConnected) {
                handleCommand('reset');
              }
            }}
            disabled={!isKeypointsConnected}
          >
            🔄 Reset
          </button>
          <button
            className={`py-2.5 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
              isKeypointsConnected
                ? 'bg-[#EB4747] hover:bg-[#d13f3f] text-white cursor-pointer hover:shadow-lg active:scale-95'
                : 'bg-[#1E1E1E] border border-white/20 text-gray-500 cursor-not-allowed'
            }`}
            title="Next Exercise"
            onClick={() => {
              console.log('🔄 Next button clicked, connected:', isKeypointsConnected);
              if (isKeypointsConnected) {
                handleCommand('next');
              }
            }}
            disabled={!isKeypointsConnected}
          >
            Next ⏭️
          </button>
        </div>
        <div className="text-center text-gray-500 text-xs mt-3">
          {isKeypointsConnected ? '✨ Navigate exercises and reset progress' : '⏳ Waiting for pose tracking connection...'}
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
