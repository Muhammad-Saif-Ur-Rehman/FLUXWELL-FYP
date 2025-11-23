import React, { useState } from 'react';
import { PlanDay, PlanExercise } from '../../types/workout';

interface AIGeneratedPlanProps {
  plan: PlanDay[];
  summary?: string;
  onSavePlan: () => void;
  onExerciseSkip: (exercise: PlanExercise, dayIndex: number, exerciseIndex: number) => void;
  isSaving?: boolean;
}

const AIGeneratedPlan: React.FC<AIGeneratedPlanProps> = ({
  plan,
  summary,
  onSavePlan,
  onExerciseSkip,
  isSaving = false
}) => {
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0])); // First day expanded by default

  const toggleDay = (dayIndex: number) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(dayIndex)) {
      newExpanded.delete(dayIndex);
    } else {
      newExpanded.add(dayIndex);
    }
    setExpandedDays(newExpanded);
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 mb-8 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">🤖 AI-Generated Workout Plan</h3>
          {summary && (
            <p className="text-gray-300 text-sm">{summary}</p>
          )}
        </div>
        <button
          onClick={onSavePlan}
          disabled={isSaving}
          className="px-6 py-3 bg-[#EF4444] hover:bg-[#DC2626] disabled:bg-gray-600 text-white rounded-lg font-bold transition-all duration-200 flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Use This Plan
            </>
          )}
        </button>
      </div>

      {/* Plan Days */}
      <div className="space-y-4">
        {plan.map((day, dayIndex) => (
          <div key={dayIndex} className="bg-[#2D3748] rounded-lg border border-gray-800">
            {/* Day Header */}
            <button
              onClick={() => toggleDay(dayIndex)}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-800 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#EF4444] rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {dayIndex + 1}
                </div>
                <div>
                  <h4 className="font-semibold text-white text-lg">{day.day}</h4>
                  {day.focus && (
                    <p className="text-gray-400 text-sm">{day.focus}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">
                  {day.exercises.length} exercise{day.exercises.length !== 1 ? 's' : ''}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedDays.has(dayIndex) ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Day Exercises */}
            {expandedDays.has(dayIndex) && (
              <div className="p-4 border-t border-gray-600">
                <div className="space-y-3">
                  {day.exercises.map((exercise, exerciseIndex) => (
                    <div
                      key={exerciseIndex}
                      className="bg-[#2D3748] rounded-lg p-4 border border-gray-800"
                    >
                      <div className="flex items-start gap-4">
                        {/* Exercise Image */}
                        <div className="w-16 h-16 bg-gray-700 rounded-lg flex-shrink-0">
                          {exercise.gifUrl ? (
                            <img
                              src={exercise.gifUrl}
                              alt={exercise.name}
                              className="w-full h-full object-cover rounded-lg"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className="w-full h-full bg-gray-700 rounded-lg flex items-center justify-center hidden">
                            <span className="text-gray-400 text-xs">No Image</span>
                          </div>
                        </div>

                        {/* Exercise Details */}
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-white text-base mb-2">
                            {exercise.name}
                          </h5>
                          
                          {/* Exercise Parameters */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-gray-400">Sets:</span>
                              <p className="text-white font-medium">{exercise.sets}</p>
                            </div>
                            
                            {exercise.reps && (
                              <div>
                                <span className="text-gray-400">Reps:</span>
                                <p className="text-white font-medium">{exercise.reps}</p>
                              </div>
                            )}
                            
                            {exercise.duration_seconds && (
                              <div>
                                <span className="text-gray-400">Duration:</span>
                                <p className="text-white font-medium">
                                  {formatDuration(exercise.duration_seconds)}
                                </p>
                              </div>
                            )}
                            
                            <div>
                              <span className="text-gray-400">Rest:</span>
                              <p className="text-white font-medium">
                                {exercise.rest_seconds}s
                              </p>
                            </div>
                          </div>

                          {/* Notes */}
                          {exercise.notes && (
                            <div className="mt-2">
                              <span className="text-gray-400 text-xs">Notes:</span>
                              <p className="text-gray-300 text-xs mt-1">{exercise.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => onExerciseSkip(exercise, dayIndex, exerciseIndex)}
                            className="px-3 py-1 text-xs border border-gray-600 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="mt-6 p-4 bg-[#2D3748] rounded-lg border border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
          <p className="text-gray-300 text-sm">
            This plan is personalized based on your fitness goals, equipment availability, and experience level.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIGeneratedPlan;
