import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Exercise } from '../../types/workout';

interface OptimizedExerciseLibraryProps {
  exercises: Exercise[];
  searchQuery: string;
  selectedFocus: string;
  focusCounts: Record<string, number>;
  focusOptions: readonly string[];
  onSearchChange: (query: string) => void;
  onFocusChange: (focus: string) => void;
  onDragStart: (e: React.DragEvent, exercise: Exercise) => void;
  onLoadMore: () => void;
  hasMoreExercises: boolean;
  isLoadingMore: boolean;
}

// Memoized Exercise Item Component with optimized rendering
const ExerciseItem = memo(({ exercise, onDragStart }: { 
  exercise: Exercise; 
  onDragStart: (e: React.DragEvent, exercise: Exercise) => void 
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onDragStart(e, exercise);
  }, [exercise, onDragStart]);

  return (
    <div
      className="bg-[#2D3748] rounded-lg p-4 cursor-grab hover:cursor-grabbing hover:bg-[#1E1E1E] hover:border-[#EF4444] transition-all duration-200 border border-gray-800"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-4">
        {/* Exercise Image with optimized loading */}
        <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 relative">
          {exercise.gifUrl && !imageError ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 bg-gray-700 flex items-center justify-center animate-pulse">
                  <span className="text-gray-400 text-xs">⏳</span>
                </div>
              )}
              <img
                src={exercise.gifUrl}
                alt={exercise.name}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                style={{ visibility: imageLoaded ? 'visible' : 'hidden' }}
                onLoad={handleImageLoad}
                onError={handleImageError}
                referrerPolicy="no-referrer"
              />
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

// Memoized Focus Filter Component
const FocusFilter = memo(({ 
  focus, 
  count, 
  isSelected, 
  onClick 
}: { 
  focus: string; 
  count: number; 
  isSelected: boolean; 
  onClick: () => void; 
}) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
      isSelected
        ? 'bg-[#EF4444] text-white shadow-lg'
        : 'bg-black/20 text-gray-300 hover:bg-[#2D3748] hover:text-white border border-white/20'
    }`}
  >
    {focus === 'all' ? 'All' : focus}
    <span className="ml-1 bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
      {count}
    </span>
  </button>
));

// Main Optimized Exercise Library Component
const OptimizedExerciseLibrary: React.FC<OptimizedExerciseLibraryProps> = ({
  exercises,
  searchQuery,
  selectedFocus,
  focusCounts,
  focusOptions,
  onSearchChange,
  onFocusChange,
  onDragStart,
  onLoadMore,
  hasMoreExercises,
  isLoadingMore
}) => {
  // Debounced search to prevent excessive filtering
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Memoized filtered exercises to prevent unnecessary re-computations
  const filteredExercises = useMemo(() => {
    if (!debouncedSearchQuery.trim() && selectedFocus === 'all') {
      return exercises;
    }
    
    return exercises.filter(exercise => {
      const matchesSearch = !debouncedSearchQuery.trim() || 
        exercise.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (exercise.target && Array.isArray(exercise.target) 
          ? exercise.target.some(t => t.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
          : exercise.target?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));
      
      // Make 'Upper Body' include both Push and Pull as well
      const matchesFocus = selectedFocus === 'all' 
        || exercise.focus === selectedFocus 
        || (selectedFocus === 'Upper Body' && (exercise.focus === 'Push' || exercise.focus === 'Pull'));
      
      return matchesSearch && matchesFocus;
    });
  }, [exercises, debouncedSearchQuery, selectedFocus]);

  // Memoized visible exercises (limit to 50 for performance)
  const visibleExercises = useMemo(() => {
    return filteredExercises.slice(0, 50);
  }, [filteredExercises]);

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 sticky top-20 h-[calc(100vh-120px)] flex flex-col shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h3 className="text-2xl font-bold text-white mb-1">Exercise Library</h3>
          <p className="text-gray-400 text-sm">Drag exercises to your workout days</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-white">{filteredExercises.length}</div>
          <div className="text-sm text-gray-400">exercises</div>
        </div>
      </div>

      {/* Search and Focus Filters */}
      <div className="mb-4 space-y-4 flex-shrink-0">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-black/20 text-white px-4 py-3 rounded-lg border border-white/20 focus:border-[#EF4444] focus:outline-none text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Focus Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {focusOptions.map(focus => {
            const count = focusCounts[focus] || 0;
            return (
              <FocusFilter
                key={focus}
                focus={focus}
                count={count}
                isSelected={selectedFocus === focus}
                onClick={() => onFocusChange(focus)}
              />
            );
          })}
        </div>
      </div>
      
      {/* Scrollable Exercise List */}
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 overscroll-contain">
        {visibleExercises.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <p className="text-gray-400 text-lg mb-2">No exercises found</p>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your search or focus filter</p>
            <button
              onClick={() => {
                onSearchChange('');
                onFocusChange('all');
              }}
              className="px-6 py-3 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] transition-colors font-medium"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleExercises.map((exercise) => (
              <ExerciseItem
                key={exercise.id}
                exercise={exercise}
                onDragStart={onDragStart}
              />
            ))}
          </div>
        )}

        {/* Load More Button - always available when more exist */}
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
      </div>
    </div>
  );
};

export default OptimizedExerciseLibrary;
