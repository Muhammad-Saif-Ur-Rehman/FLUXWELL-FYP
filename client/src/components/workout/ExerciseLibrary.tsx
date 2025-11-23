import React, { memo, useCallback } from 'react';
import { Exercise } from '../../types/workout';

interface ExerciseLibraryProps {
  exercises: Exercise[];
  selectedFocus: string;
  focusCounts: Record<string, number>;
  focusOptions: readonly string[];
  onFocusChange: (focus: string) => void;
  onDragStart: (e: React.DragEvent, exercise: Exercise) => void;
  onLoadMore: () => void;
  hasMoreExercises: boolean;
  isLoadingMore: boolean;
}

// Custom hook for image optimization
const useImageOptimization = (src: string | undefined) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    if (!src) return;
    
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);
    img.src = src;
  }, [src]);

  return { imageLoaded, imageError };
};

// Memoized Exercise Item Component
const ExerciseItem = memo(({ exercise, onDragStart }: { exercise: Exercise; onDragStart: (e: React.DragEvent, exercise: Exercise) => void }) => {
  const imageSrc = exercise.gifUrl || exercise.imageUrl;
  const { imageLoaded, imageError } = useImageOptimization(imageSrc);

  return (
    <div
      className="bg-[#2D3748] rounded-lg p-4 cursor-grab hover:cursor-grabbing hover:bg-[#1E1E1E] hover:border-[#EF4444] transition-all duration-200 border border-gray-800"
      draggable
      onDragStart={(e) => onDragStart(e, exercise)}
    >
      <div className="flex items-center gap-4">
        {/* Exercise Image */}
        <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
          {imageSrc && !imageError ? (
            <>
              {!imageLoaded && (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center animate-pulse">
                  <span className="text-gray-400 text-xs">⏳</span>
                </div>
              )}
              {imageLoaded && (
                <img
                  src={imageSrc}
              alt={exercise.name}
              className="w-full h-full object-cover"
              loading="lazy"
                  decoding="async"
                />
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <span className="text-gray-400 text-xs">💪</span>
            </div>
          )}
        </div>

        {/* Exercise Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-white text-sm truncate">
              {exercise.name}
            </h4>
            {exercise.focus && (
              <span className={`${
                exercise.focus === 'Upper Body' ? 'bg-blue-500' :
                exercise.focus === 'Lower Body' ? 'bg-green-500' :
                exercise.focus === 'Full Body' ? 'bg-purple-500' :
                exercise.focus === 'Push' ? 'bg-orange-500' :
                exercise.focus === 'Pull' ? 'bg-red-500' : 'bg-gray-500'
              } text-white text-xs px-2 py-0.5 rounded-full font-medium`}>
                {exercise.focus}
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            {exercise.target && (
              <span>
                <span className="text-gray-500">Target:</span> {Array.isArray(exercise.target) ? exercise.target.join(', ') : exercise.target}
              </span>
            )}
          </div>
        </div>

        {/* Drag Indicator */}
        <div className="text-gray-400 text-xs">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm0 4h2v2H9v-2zM5 7h2v2H5V7zm0 4h2v2H5v-2zm0 4h2v2H5v-2zm8-8h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
            </svg>
        </div>
      </div>
    </div>
  );
});

const ExerciseLibrary: React.FC<ExerciseLibraryProps> = ({
  exercises,
  selectedFocus,
  focusCounts,
  focusOptions,
  onFocusChange,
  onDragStart,
  onLoadMore,
  hasMoreExercises,
  isLoadingMore
}) => {
  const handleClearFilters = useCallback(() => {
    onFocusChange('all');
  }, [onFocusChange]);

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 sticky top-20 h-[calc(100vh-120px)] flex flex-col shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      {/* Focus Filters */}
      <div className="mb-4 flex-shrink-0">
        {/* Focus Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {focusOptions.map(focus => {
            const count = focusCounts[focus] || 0;
            return (
              <button
                key={focus}
                onClick={() => onFocusChange(focus)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  selectedFocus === focus
                    ? 'bg-[#EF4444] text-white shadow-lg'
                    : 'bg-black/20 text-gray-300 hover:bg-[#2D3748] hover:text-white border border-white/20'
                }`}
              >
                {focus === 'all' ? 'All' : focus}
                <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Scrollable Exercise List */}
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 overscroll-contain">
        {exercises.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <p className="text-gray-400 text-lg mb-2">No exercises found</p>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your focus filter</p>
            <button
              onClick={handleClearFilters}
              className="px-6 py-3 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] transition-colors font-medium"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {exercises.slice(0, 100).map((exercise) => (
              <ExerciseItem
                key={exercise.id}
                exercise={exercise}
                onDragStart={onDragStart}
              />
            ))}
            
            {/* Load More Button */}
            {hasMoreExercises && (
              <div className="flex justify-center pt-4">
                <button 
                  id="load-more-button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-3 bg-[#EF4444] hover:bg-[#DC2626] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {isLoadingMore ? 'Loading...' : 'Load More Exercises'}
                </button>
              </div>
            )}
            
            {/* Show more indicator if there are more items */}
            {exercises.length > 100 && (
              <div className="text-center py-2 text-gray-400 text-sm">
                Showing first 100 of {exercises.length} exercises
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExerciseLibrary;