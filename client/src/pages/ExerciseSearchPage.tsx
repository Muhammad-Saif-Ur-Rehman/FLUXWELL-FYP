import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Exercise } from '../types/workout';
import { WorkoutService } from '../services/workoutService';
import { aiWorkoutService } from '../services/aiWorkoutService';
import ExerciseLibrary from '../components/workout/ExerciseLibrary';
import logoIcon from '../assets/images/logo-icon.svg';

const ExerciseSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedFocus, setSelectedFocus] = useState('all');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreExercises, setHasMoreExercises] = useState(false);
  const allExercisesRef = useRef<Exercise[]>([]);

  // Focus options for filtering
  const focusOptions = ['all', 'Upper Body', 'Lower Body', 'Full Body', 'Push', 'Pull'] as const;

  // Calculate focus counts
  const focusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: exercises.length };
    focusOptions.slice(1).forEach(focus => {
      counts[focus] = exercises.filter(ex => ex.focus === focus).length;
    });
    return counts;
  }, [exercises]);

  // Filter exercises based on selected focus
  const filteredExercises = useMemo(() => {
    if (selectedFocus === 'all') return exercises;
    return exercises.filter(ex => ex.focus === selectedFocus);
  }, [exercises, selectedFocus]);

  // Helper function to determine exercise focus based on target muscles and body parts
  const determineExerciseFocus = (targetMuscles: string | string[], bodyParts: string | string[]): string => {
    const targets = Array.isArray(targetMuscles) ? targetMuscles : [targetMuscles].filter(Boolean);
    const bodyPartsArray = Array.isArray(bodyParts) ? bodyParts : [bodyParts].filter(Boolean);
    
    const allTargets = [...targets, ...bodyPartsArray].map(t => t.toLowerCase().trim()).filter(t => t);
    
    // Check for full body exercises first
    const fullBodyKeywords = ['full body', 'core', 'cardio', 'abs', 'abdominals', 'waist'];
    if (allTargets.some(t => fullBodyKeywords.some(keyword => t.includes(keyword)))) {
      return 'Full Body';
    }
    
    // Check for push exercises (chest, shoulders, triceps)
    const pushKeywords = ['chest', 'shoulders', 'triceps', 'pectorals', 'deltoids'];
    const pushMatches = allTargets.reduce((count, t) => 
      count + pushKeywords.filter(keyword => t.includes(keyword)).length, 0);
    
    // Check for pull exercises (back, biceps)
    const pullKeywords = ['back', 'biceps', 'lats', 'rhomboids', 'traps', 'upper back'];
    const pullMatches = allTargets.reduce((count, t) => 
      count + pullKeywords.filter(keyword => t.includes(keyword)).length, 0);
    
    // If it's clearly a push or pull exercise, categorize accordingly
    if (pushMatches > 0 && pullMatches === 0) {
      return 'Push';
    } else if (pullMatches > 0 && pushMatches === 0) {
      return 'Pull';
    } else if (pushMatches > 0 && pullMatches > 0) {
      // Mixed upper body - determine based on which is more prominent
      return pushMatches >= pullMatches ? 'Push' : 'Pull';
    }
    
    // Check for upper body exercises (any upper body muscle)
    const upperBodyKeywords = ['chest', 'back', 'shoulders', 'arms', 'triceps', 'biceps', 'upper arms', 'upper back', 'pectorals', 'deltoids', 'lats', 'rhomboids', 'traps'];
    if (allTargets.some(t => upperBodyKeywords.some(keyword => t.includes(keyword)))) {
      return 'Upper Body';
    }
    
    // Check for lower body exercises
    const lowerBodyKeywords = ['legs', 'glutes', 'hamstrings', 'quads', 'calves', 'lower legs', 'upper legs', 'thighs', 'gluteals', 'quadriceps', 'hamstring', 'calf'];
    if (allTargets.some(t => lowerBodyKeywords.some(keyword => t.includes(keyword)))) {
      return 'Lower Body';
    }
    
    // Default fallback
    return 'Full Body';
  };

  const loadInitialExercises = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Prefer AI library with high limit; fallback to local
      try {
        const aiRes = await aiWorkoutService.filterLibrary({ search: '' }, 600);
        const list = (aiRes?.approved_exercises || []).map((ex: any) => ({
          id: ex.exerciseId,
          name: ex.name,
          gifUrl: ex.gifUrl,
          target: ex.targetMuscles,
          equipment: ex.equipments,
          bodyPart: ex.bodyParts,
          secondaryMuscles: ex.secondaryMuscles,
          instructions: ex.instructions,
          category: 'ai-recommended',
          focus: determineExerciseFocus(ex.targetMuscles || [], ex.bodyParts || [])
        }));
        if (list.length > 0) {
          // Defer large state update to next tick to keep TTI responsive
          const applyList = () => { setAllExercises(list); setExercises(list); };
          requestIdleCallback?.(applyList) || setTimeout(applyList, 0);
        } else {
          throw new Error('AI returned empty');
        }
      } catch (aiError) {
        const searchResults = await WorkoutService.searchExercisesLocal({ limit: 150, page: 1 });
        const exercisesWithFocus = searchResults.map(ex => ({
          ...ex,
          focus: determineExerciseFocus(ex.target || '', ex.bodyPart || '')
        }));
        setAllExercises(exercisesWithFocus);
        setExercises(exercisesWithFocus);
      }
    } catch (error) {
      console.error('Error loading initial exercises:', error);
      setExercises([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Keep a stable ref of allExercises to avoid re-triggering effects/callbacks
  useEffect(() => {
    allExercisesRef.current = allExercises;
  }, [allExercises]);

  const performLiveSearch = useCallback(async () => {
    try {
      const query = debouncedSearchQuery.trim().toLowerCase();

      // 1) Search within already loaded exercises first (client-side)
      if (query.length > 0) {
        const source = allExercisesRef.current.length > 0 ? allExercisesRef.current : exercises;
        const localMatches = source.filter((ex) => {
          const name = (ex.name || '').toLowerCase();
          const focus = (ex as any).focus ? String((ex as any).focus).toLowerCase() : '';
          const target = Array.isArray(ex.target)
            ? ex.target.map(t => String(t).toLowerCase()).join(' ')
            : String(ex.target || '').toLowerCase();
          const bodyPart = String(ex.bodyPart || '').toLowerCase();
          const equipment = Array.isArray(ex.equipment)
            ? ex.equipment.map(e => String(e).toLowerCase()).join(' ')
            : String(ex.equipment || '').toLowerCase();

          return (
            name.includes(query) ||
            focus.includes(query) ||
            target.includes(query) ||
            bodyPart.includes(query) ||
            equipment.includes(query)
          );
        });

        if (localMatches.length > 0) {
          // Use local matches; no external calls
          requestIdleCallback?.(() => setExercises(localMatches)) || setTimeout(() => setExercises(localMatches), 0);
          return;
        }
      }

      // 2) If no local matches, query the external DB narrowly (very small limit & stricter threshold)
      if (query.length > 0) {
        setIsLoading(true);
        const results = await WorkoutService.searchExercisesSmart(query, 5, 0.6);
        const safeArray = Array.isArray(results) ? results : [];
        const mapped = safeArray.map((ex: any) => ({
          id: ex.exerciseId || ex.id,
          exercise_id: ex.exerciseId,
          name: ex.name,
          gifUrl: ex.gifUrl,
          target: ex.targetMuscles,
          equipment: ex.equipments,
          bodyPart: ex.bodyParts,
          secondaryMuscles: ex.secondaryMuscles,
          instructions: ex.instructions,
          category: 'db-search',
          focus: determineExerciseFocus(ex.targetMuscles || [], ex.bodyParts || [])
        }));
        requestIdleCallback?.(() => setExercises(mapped)) || setTimeout(() => setExercises(mapped), 0);
        setIsLoading(false);
        return;
      }

      // 3) Empty query fallback → reload initial set
      requestIdleCallback?.(() => setExercises(allExercisesRef.current)) || setTimeout(() => setExercises(allExercisesRef.current), 0);
    } catch (error) {
      console.error('Error performing live search:', error);
      setExercises([]);
    } finally {
      // Ensure not stuck in loading state; only clear if a remote call was in progress
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, exercises, loadInitialExercises]);

  // Debounce search query to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Live search effect
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (debouncedSearchQuery.trim() !== '') {
        await performLiveSearch();
        return;
      }
      // Restore from local cache without refetching
      if (!cancelled) {
        if (allExercisesRef.current.length > 0) {
          setExercises(allExercisesRef.current);
        } else {
          await loadInitialExercises();
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedSearchQuery, loadInitialExercises, performLiveSearch]);

  // Load initial exercises on component mount
  useEffect(() => {
    loadInitialExercises();
  }, [loadInitialExercises]);

  const clearSearch = () => {
    setSearchQuery('');
    // Immediately restore full local list
    setExercises(allExercises);
  };

  const handleExerciseSelect = (exercise: Exercise) => {
    // Navigate back to workout page with selected exercise
    navigate('/workouts', { state: { selectedExercise: exercise } });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleFocusChange = (focus: string) => {
    setSelectedFocus(focus);
  };

  const handleDragStart = (e: React.DragEvent, exercise: Exercise) => {
    // For search page, we don't need drag functionality, but we can handle it
    e.preventDefault();
  };

  const handleLoadMore = () => {
    // For now, we'll just set hasMoreExercises to false since we're loading all exercises
    setHasMoreExercises(false);
  };


  if (isLoading && exercises.length === 0) {
    return (
      <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Searching exercises...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header */}
      <header className="w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
        <div className="max-w-[1920px] mx-auto px-10 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
            <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
              <span className="text-white">Flux</span>
              <span className="text-[#EB4747]">Well</span>
            </h2>
          </div>
          <button
            onClick={() => navigate('/workouts')}
            className="px-6 py-3 border border-white/30 text-gray-200 hover:bg-white/10 rounded-lg font-bold transition-all duration-200"
          >
            Back to Workouts
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-6 md:px-10 pt-[73px] pb-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[36px] font-extrabold">Exercise Library</h1>
            <p className="text-lg text-gray-400">Search and discover exercises for your workout plan</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Found {exercises.length} exercises</p>
            <p className="text-xs text-gray-500">Live search from 1500+ exercises</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-[#1E1E1E] rounded-2xl p-6 mb-8 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
          <div className="relative">
            <div className="bg-black/20 rounded-lg p-4 flex items-center">
              <svg
                className="w-5 h-5 mr-3 flex-shrink-0 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search exercises by name, category, target muscle, or body part..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white placeholder-gray-400 flex-1 outline-none text-lg"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="ml-4 text-gray-400 hover:text-white transition-colors text-xl"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
              {isLoading && (
                <div className="ml-4" aria-live="polite" aria-busy="true">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
                </div>
              )}
            </div>
          </div>
          
          {/* Search Tips */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-400">
              💡 Start typing to search through 1500+ exercises. Search by exercise name, muscle group, or equipment.
            </p>
          </div>
        </div>

        {/* Exercise Library */}
        <ExerciseLibrary 
          exercises={filteredExercises}
          selectedFocus={selectedFocus}
          focusCounts={focusCounts}
          focusOptions={focusOptions}
          onFocusChange={handleFocusChange}
          onDragStart={handleDragStart}
          onLoadMore={handleLoadMore}
          hasMoreExercises={hasMoreExercises}
          isLoadingMore={isLoadingMore}
        />
      </main>
    </div>
  );
};

export default ExerciseSearchPage;
