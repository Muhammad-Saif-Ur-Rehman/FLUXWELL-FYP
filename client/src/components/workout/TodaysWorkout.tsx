import React from 'react';
import { WorkoutSession } from '../../types/workout';

interface TodaysWorkoutProps {
  workout: WorkoutSession | null;
  onStartWorkout: (workoutId: string) => void;
  onCompleteExercise: (exerciseId: string) => Promise<void>;
}

const TodaysWorkout: React.FC<TodaysWorkoutProps> = ({
  workout,
  onStartWorkout,
  onCompleteExercise
}) => {
  if (!workout) {
    return (
      <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <h3 className="text-xl font-bold text-white mb-6">Today's Workout</h3>
        <div className="text-center py-8">
          <p className="text-gray-400">No workout scheduled for today.</p>
          <p className="text-gray-400 text-sm mt-2">Drag exercises here to build your workout.</p>
        </div>
      </div>
    );
  }

  // Ensure exercises is always an array
  const safeExercises = workout.exercises || [];

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      <h3 className="text-xl font-bold text-white mb-6">Today's Workout</h3>
      
      {safeExercises.map((exercise, index) => (
        <div
          key={`${exercise.id}-${index}`}
          className="bg-[#2D3748] rounded-lg p-4 mb-4 last:mb-0"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Exercise GIF/Image */}
              <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                {exercise.gifUrl ? (
                  <img
                    src={exercise.gifUrl}
                    alt={exercise.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : exercise.imageUrl ? (
                  <img
                    src={exercise.imageUrl}
                    alt={exercise.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                
                {/* Fallback for failed images */}
                <div className="w-full h-full bg-gray-700 flex items-center justify-center hidden">
                  <span className="text-gray-400 text-xs">🏋️</span>
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white text-sm truncate">{exercise.name}</h4>
                <p className="text-gray-400 text-xs">
                  {exercise.sets || 3} sets of {exercise.reps || 10} reps
                </p>
              </div>
            </div>
            <button 
              onClick={() => onCompleteExercise(exercise.exercise_id || exercise.id)}
              className="px-3 py-1 bg-[#EF4444] text-white text-xs rounded hover:bg-red-600 transition-colors font-medium ml-3"
            >
              Mark Complete
            </button>
          </div>
        </div>
      ))}

      {safeExercises.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">Drag exercises here to build your workout.</p>
        </div>
      )}
    </div>
  );
};

export default TodaysWorkout;
