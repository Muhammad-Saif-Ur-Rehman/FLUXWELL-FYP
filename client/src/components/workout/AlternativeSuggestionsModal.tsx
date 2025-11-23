import React from 'react';
import { ExerciseOut } from '../../types/workout';

interface AlternativeSuggestionsModalProps {
  isOpen: boolean;
  alternatives: ExerciseOut[];
  rationale?: string;
  onSelectAlternative: (exercise: ExerciseOut) => void;
  onClose: () => void;
}

const AlternativeSuggestionsModal: React.FC<AlternativeSuggestionsModalProps> = ({
  isOpen,
  alternatives,
  rationale,
  onSelectAlternative,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1E1E1E] rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">💡 Alternative Exercises</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {rationale && (
          <div className="mb-6 p-4 bg-[#2D3748] rounded-lg border border-gray-800">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Why these alternatives?</h4>
            <p className="text-sm text-gray-400">{rationale}</p>
          </div>
        )}

        <div className="space-y-3">
          {alternatives.map((exercise, index) => (
            <div
              key={index}
              className="p-4 bg-[#2D3748] rounded-lg border border-gray-800 hover:border-[#EF4444] transition-colors cursor-pointer"
              onClick={() => onSelectAlternative(exercise)}
            >
              <div className="flex items-center gap-4">
                {exercise.gifUrl && (
                  <img
                    src={exercise.gifUrl}
                    alt={exercise.name}
                    className="w-16 h-16 rounded object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-medium text-white text-lg mb-2">{exercise.name}</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    {exercise.targetMuscles.length > 0 && (
                      <div>
                        <span className="text-gray-400">Target Muscles:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exercise.targetMuscles.map((muscle, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[#EF4444] text-white text-xs rounded-full"
                            >
                              {muscle}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {exercise.bodyParts.length > 0 && (
                      <div>
                        <span className="text-gray-400">Body Parts:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exercise.bodyParts.map((part, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[#10B981] text-white text-xs rounded-full"
                            >
                              {part}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {exercise.equipments.length > 0 && (
                      <div>
                        <span className="text-gray-400">Equipment:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exercise.equipments.map((equipment, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[#3B82F6] text-white text-xs rounded-full"
                            >
                              {equipment}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {exercise.instructions && exercise.instructions.length > 0 && (
                    <div className="mt-3">
                      <span className="text-gray-400 text-sm">Instructions:</span>
                      <ol className="list-decimal list-inside text-xs text-gray-300 mt-1 space-y-1">
                        {exercise.instructions.slice(0, 3).map((instruction, idx) => (
                          <li key={idx} className="line-clamp-2">{instruction}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
                
                <div className="text-right">
                  <button className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg font-medium transition-colors">
                    Use This
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlternativeSuggestionsModal;
