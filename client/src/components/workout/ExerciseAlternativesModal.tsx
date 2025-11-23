import React from 'react';
import { ExerciseOut } from '../../types/workout';

interface ExerciseAlternativesModalProps {
  isOpen: boolean;
  onClose: () => void;
  alternatives: ExerciseOut[];
  rationale?: string;
  onSelectAlternative: (exercise: ExerciseOut) => void;
  isLoading?: boolean;
}

const ExerciseAlternativesModal: React.FC<ExerciseAlternativesModalProps> = ({
  isOpen,
  onClose,
  alternatives,
  rationale,
  onSelectAlternative,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E1E1E] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Exercise Alternatives</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {rationale && (
            <p className="text-gray-300 text-sm mt-2">{rationale}</p>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
              <p className="text-gray-300">Finding alternatives...</p>
            </div>
          ) : alternatives.length > 0 ? (
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">
                Here are some alternative exercises that might work better for you:
              </p>
              <div className="grid gap-4">
                {alternatives.map((exercise) => (
                  <div
                    key={exercise.exerciseId}
                    className="bg-[#2D3748] rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
                    onClick={() => onSelectAlternative(exercise)}
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
                        <h4 className="font-semibold text-white text-lg mb-2">
                          {exercise.name}
                        </h4>
                        
                        {/* Target Muscles */}
                        {exercise.targetMuscles.length > 0 && (
                          <div className="mb-2">
                            <span className="text-gray-400 text-xs">Target:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {exercise.targetMuscles.map((muscle, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-[#EF4444] text-white text-xs rounded-full"
                                >
                                  {muscle}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Equipment */}
                        {exercise.equipments.length > 0 && (
                          <div className="mb-2">
                            <span className="text-gray-400 text-xs">Equipment:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {exercise.equipments.map((equipment, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full"
                                >
                                  {equipment}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Instructions Preview */}
                        {exercise.instructions.length > 0 && (
                          <div>
                            <span className="text-gray-400 text-xs">Instructions:</span>
                            <p className="text-gray-300 text-xs mt-1 line-clamp-2">
                              {exercise.instructions[0]}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Select Button */}
                      <button
                        className="px-4 py-2 bg-[#EF4444] text-white rounded-md hover:bg-[#DC2626] transition-colors text-sm font-medium flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAlternative(exercise);
                        }}
                      >
                        Use This
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🤔</div>
              <p className="text-gray-300">No alternatives found</p>
              <p className="text-gray-400 text-sm mt-2">
                Try searching for exercises manually or contact support.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-600 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExerciseAlternativesModal;
