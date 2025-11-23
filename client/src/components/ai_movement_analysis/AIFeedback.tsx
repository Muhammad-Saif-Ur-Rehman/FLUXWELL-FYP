import { memo, useMemo } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';

const AIFeedback = memo(() => {
  const { keypoints } = useWebSocket();

  // Memoize extracted data to prevent unnecessary recalculations
  const feedbackData = useMemo(() => {
    const data = keypoints as any;
    return {
      aiFeedback: data?.ai_feedback,
      aiErrors: data?.ai_errors || [],
      currentExercise: data?.current_exercise,
    };
  }, [keypoints]);

  const { aiFeedback, aiErrors, currentExercise } = feedbackData;

  // Only show if AI is actually active (has feedback or exercise data)
  const isAiActive = aiFeedback || currentExercise;
  
  if (!isAiActive) {
    return null;
  }

  const hasErrors = aiErrors && aiErrors.length > 0;

  return (
    <div className="bg-[#1a1a1a] border border-[#663333] rounded-lg p-4 glass-card max-h-[180px] overflow-y-auto">
      {/* Exercise Header */}
      <div className="mb-3 pb-2 border-b border-[#663333]">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm font-medium">Current Exercise:</span>
          <span className="text-[#EA2A2A] font-semibold text-sm">{currentExercise || 'Starting...'}</span>
        </div>
      </div>

      {/* AI Feedback Box */}
      <div className={`p-3 rounded-lg mb-3 ${hasErrors ? 'bg-red-900/20 border border-red-700/50' : 'bg-[#EA2A2A]/10 border border-[#EA2A2A]/30'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🤖</span>
          <span className="text-[#EA2A2A] font-semibold text-sm">AI Coach:</span>
        </div>
        <div className="text-white leading-relaxed text-sm">
          {aiFeedback || 'AI Coach Ready - Analyzing your form...'}
        </div>
      </div>

      {/* Error List - Limited display to prevent clutter */}
      {hasErrors && aiErrors.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
          <div className="text-red-400 font-semibold mb-2 flex items-center gap-2 text-sm">
            <span>⚠️</span>
            Form Issues ({aiErrors.length > 3 ? `3 of ${aiErrors.length}` : aiErrors.length}):
          </div>
          <div className="max-h-[80px] overflow-y-auto">
            <ul className="space-y-1">
              {aiErrors.slice(0, 3).map((error: string, index: number) => (
                <li key={index} className="text-red-300 text-xs flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  {error}
                </li>
              ))}
              {aiErrors.length > 3 && (
                <li className="text-red-400 text-xs italic mt-1">
                  ... and {aiErrors.length - 3} more issues
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
});

AIFeedback.displayName = 'AIFeedback';

export default AIFeedback;
