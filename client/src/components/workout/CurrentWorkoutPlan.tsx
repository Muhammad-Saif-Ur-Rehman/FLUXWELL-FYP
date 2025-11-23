import React, { useState } from 'react';
import { WorkoutDay, Exercise } from '../../types/workout';

interface CurrentWorkoutPlanProps {
  selectedDay: WorkoutDay | null;
  onExerciseComplete: (exerciseId: string) => void;
  onExerciseSkip: (exerciseId: string) => void;
}

const CurrentWorkoutPlan: React.FC<CurrentWorkoutPlanProps> = ({
  selectedDay,
  onExerciseComplete,
  onExerciseSkip
}) => {
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());

  const toggleExercise = (exerciseId: string) => {
    const newExpanded = new Set(expandedExercises);
    if (newExpanded.has(exerciseId)) {
      newExpanded.delete(exerciseId);
    } else {
      newExpanded.add(exerciseId);
    }
    setExpandedExercises(newExpanded);
  };

  // Safe numeric helpers to avoid NaN rendering
  const toNumber = (value: any, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const totalSets = React.useMemo(() => {
    if (!selectedDay?.exercises?.length) return 0;
    return selectedDay.exercises.reduce((total, ex) => {
      return total + toNumber((ex as any).sets, 0);
    }, 0);
  }, [selectedDay]);

  const totalReps = React.useMemo(() => {
    if (!selectedDay?.exercises?.length) return 0;
    return selectedDay.exercises.reduce((total, ex) => {
      const sets = toNumber((ex as any).sets, 0);
      const reps = toNumber((ex as any).reps, 0);
      return total + sets * reps;
    }, 0);
  }, [selectedDay]);

  if (!selectedDay) {
    return (
      <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <h3 className="text-xl font-bold text-white mb-4">Current Workout Plan</h3>
        <div className="text-center py-8">
          <p className="text-gray-400">Select a day from the calendar to view your workout plan</p>
        </div>
      </div>
    );
  }

  if (!selectedDay.exercises || selectedDay.exercises.length === 0) {
    return (
      <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <h3 className="text-xl font-bold text-white mb-4">
          {selectedDay.dayOfWeek} - {selectedDay.date}
        </h3>
        <div className="text-center py-8">
          <p className="text-gray-400">No exercises planned for this day</p>
          <p className="text-gray-500 text-sm mt-2">Add exercises from the exercise library</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">
          {selectedDay.dayOfWeek} - {selectedDay.date}
        </h3>
        <div className="text-sm text-gray-400">
          {selectedDay.exercises.length} exercise{selectedDay.exercises.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-4">
        {selectedDay.exercises.map((exercise, index) => (
          <div
            key={exercise.id || index}
            className="bg-[#2D3748] rounded-lg overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors"
          >
            {/* Exercise Header */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#EF4444] rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">{exercise.name}</h4>
                    <p className="text-gray-400 text-sm">
                      {exercise.sets || 3} sets × {exercise.reps || 10} reps
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => toggleExercise(exercise.id || String(index))}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transform transition-transform ${
                      expandedExercises.has(exercise.id || String(index)) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Exercise Details (Expandable) */}
            {expandedExercises.has(exercise.id || String(index)) && (
              <div className="border-t border-gray-800 p-4 bg-[#2D3748]">
                {/* Exercise Image/GIF */}
                <div className="mb-4">
                  {exercise.gifUrl ? (
                    <img
                      src={exercise.gifUrl}
                      alt={exercise.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  ) : exercise.imageUrl ? (
                    <img
                      src={exercise.imageUrl}
                      alt={exercise.name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-700 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400">No Image Available</span>
                    </div>
                  )}
                </div>

                {/* Exercise Information */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {exercise.target && (
                    <div>
                      <span className="text-gray-400 text-sm">Target Muscle:</span>
                      <p className="text-white font-medium">{exercise.target}</p>
                    </div>
                  )}
                  {exercise.equipment && (
                    <div>
                      <span className="text-gray-400 text-sm">Equipment:</span>
                      <p className="text-white font-medium">{exercise.equipment}</p>
                    </div>
                  )}
                  {exercise.bodyPart && (
                    <div>
                      <span className="text-gray-400 text-sm">Body Part:</span>
                      <p className="text-white font-medium">{exercise.bodyPart}</p>
                    </div>
                  )}
                  {exercise.category && (
                    <div>
                      <span className="text-gray-400 text-sm">Category:</span>
                      <p className="text-white font-medium">{exercise.category}</p>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                {exercise.instructions && exercise.instructions.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-gray-400 text-sm font-medium mb-2">Instructions:</h5>
                    <ol className="list-decimal list-inside space-y-1">
                      {exercise.instructions.map((instruction, idx) => (
                        <li key={idx} className="text-white text-sm">{instruction}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => onExerciseComplete(exercise.id || String(index))}
                    className="flex-1 px-4 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Perform Exercise
                  </button>
                  <button
                    onClick={() => onExerciseSkip(exercise.id || String(index))}
                    className="px-4 py-3 border border-gray-600 text-gray-300 hover:bg-gray-700 rounded-lg font-medium transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Quick Action Bar */}
            <div className="border-t border-gray-800 p-3 bg-[#2D3748]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-gray-400 text-sm">
                    {exercise.sets || 3} sets × {exercise.reps || 10} reps
                  </span>
                  {exercise.target && (
                    <span className="text-gray-500 text-sm">• {exercise.target}</span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => onExerciseComplete(exercise.id || String(index))}
                    className="px-3 py-1 bg-[#10B981] hover:bg-[#059669] text-white text-xs rounded-md font-medium transition-colors"
                  >
                    Perform
                  </button>
                  <button
                    onClick={() => onExerciseSkip(exercise.id || String(index))}
                    className="px-3 py-1 border border-gray-600 text-gray-300 hover:bg-gray-700 text-xs rounded-md font-medium transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Workout Summary */}
      <div className="mt-6 p-4 bg-[#2D3748] rounded-lg border border-gray-800">
        <h4 className="text-white font-semibold mb-3">Workout Summary</h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-[#EF4444]">{selectedDay.exercises.length}</p>
            <p className="text-gray-400 text-sm">Total Exercises</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#10B981]">{totalSets}</p>
            <p className="text-gray-400 text-sm">Total Sets</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[#3B82F6]">{totalReps}</p>
            <p className="text-gray-400 text-sm">Total Reps</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentWorkoutPlan;
