import React, { useState, useEffect, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Exercise } from '../types/workout';
import { WorkoutService, mockExercises } from '../services/workoutService';
import { aiWorkoutService } from '../services/aiWorkoutService';
import logoIcon from '../assets/images/logo-icon.svg';
import Toast from '../components/ui/Toast';

// Lazy load heavy components
const OptimizedExerciseLibrary = lazy(() => import('../components/workout/OptimizedExerciseLibrary'));

const CreateWorkoutPlanPage: React.FC = () => {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>([]);
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreExercises, setHasMoreExercises] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [aiMode, setAiMode] = useState(() => {
    try {
      return localStorage.getItem('ai_plans') === 'true';
    } catch {
      return false;
    }
  });
  const focusOptions = ['all', 'Upper Body', 'Lower Body', 'Full Body', 'Push', 'Pull'] as const;
  
  const EXERCISES_PER_PAGE = 20; // Reduced for better performance

  const [isSaving, setIsSaving] = useState(false);

  // Confirmation dialog + toast state
  const [showConfirm, setShowConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<{ date: string; plan_type: string }[]>([]);
  const [pendingEntries, setPendingEntries] = useState<{ date: string; workout_details: any }[] | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: 'success' | 'error'; message: string }>({ visible: false, type: 'success', message: '' });


  const weekdays = [
    { id: 1, name: 'Monday', short: 'Mon' },
    { id: 2, name: 'Tuesday', short: 'Tue' },
    { id: 3, name: 'Wednesday', short: 'Wed' },
    { id: 4, name: 'Thursday', short: 'Thu' },
    { id: 5, name: 'Friday', short: 'Fri' },
    { id: 6, name: 'Saturday', short: 'Sat' },
    { id: 7, name: 'Sunday', short: 'Sun' }
  ];

  const normalizeFocusLabel = (raw: string): 'Upper Body' | 'Lower Body' | 'Full Body' | 'Push' | 'Pull' => {
    const f = (raw || '').toLowerCase().trim();
    if (f.includes('upper')) return 'Upper Body';
    if (f.includes('lower') || f.includes('leg')) return 'Lower Body';
    if (f.includes('push') || f.includes('chest') || f.includes('shoulder') || f.includes('tricep')) return 'Push';
    if (f.includes('pull') || f.includes('back') || f.includes('bicep') || f.includes('lat')) return 'Pull';
    return 'Full Body';
  };

  const determineExerciseFocus = (target: string | string[], bodyPart: string | string[]): string => {
    const targetStr = Array.isArray(target) ? target.join(' ').toLowerCase() : (target || '').toLowerCase();
    const bodyPartStr = Array.isArray(bodyPart) ? bodyPart.join(' ').toLowerCase() : (bodyPart || '').toLowerCase();
    const combined = `${targetStr} ${bodyPartStr}`;

    // Explicit Push/Pull checks
    if (combined.includes('chest') || combined.includes('shoulder') || combined.includes('tricep')) return 'Push';
    if (combined.includes('back') || combined.includes('bicep') || combined.includes('lat')) return 'Pull';
    
    if (combined.includes('legs') || combined.includes('glutes') || combined.includes('calves') || 
        combined.includes('hamstring') || combined.includes('quadricep')) {
      return normalizeFocusLabel('Lower Body');
    }
    
    if (combined.includes('cardio') || combined.includes('full body')) {
      return normalizeFocusLabel('Full Body');
    }
    
    if (combined.includes('upper') || combined.includes('upper arms') || combined.includes('upper back')) return 'Upper Body';
    
    return normalizeFocusLabel('Full Body');
  };

  // Load initial exercises with optimized caching - only when needed
  useEffect(() => {
    const loadInitialExercises = async () => {
      try {
        setLoading(true);
        console.log('Starting to load initial exercises for custom workout creation...');
        
        // Try AI service first with reduced limit
        try {
          console.log('Attempting AI service...');
          const aiResponse = await aiWorkoutService.filterLibrary({
            focus: undefined,
            muscles: [],
            equipment: [],
            search: '',
            limit: 20  // Reduced from 50 to 20 for faster initial load
          });
          
          if (aiResponse && aiResponse.approved_exercises && aiResponse.approved_exercises.length > 0) {
            console.log('AI Response received:', aiResponse.approved_exercises.length, 'exercises');
            const exercisesWithFocus = aiResponse.approved_exercises.map((ex: any) => ({
              id: ex.exerciseId,
              name: ex.name,
              gifUrl: ex.gifUrl,
              target: ex.targetMuscles,
              bodyPart: ex.bodyParts,
              equipment: ex.equipments,
              focus: determineExerciseFocus(ex.targetMuscles?.join(' ') || '', ex.bodyParts?.join(' ') || ''),
              profile_score: ex.profile_score || 1.0
            }));
            setExercises(exercisesWithFocus);
            setFilteredExercises(exercisesWithFocus);
            setHasMoreExercises(aiResponse.approved_exercises.length >= 20);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.log('AI service failed, falling back to local service:', error);
        }
        
        // Fallback to local service with reduced limit
        try {
          const localResponse = await WorkoutService.searchExercisesLocal({ limit: 20 });
          const exercisesWithFocus = localResponse.map(ex => ({
            ...ex,
            focus: normalizeFocusLabel(determineExerciseFocus(ex.target || '', ex.bodyPart || ''))
          }));
          setExercises(exercisesWithFocus);
          setFilteredExercises(exercisesWithFocus);
          setHasMoreExercises(localResponse.length >= 20);
        } catch (localError) {
          console.error('Local service failed, using mock data:', localError);
          const mockExercisesWithFocus = mockExercises.slice(0, 20).map(ex => ({
            ...ex,
            focus: normalizeFocusLabel(determineExerciseFocus(ex.target || '', ex.bodyPart || ''))
          }));
          setExercises(mockExercisesWithFocus);
          setFilteredExercises(mockExercisesWithFocus);
          setHasMoreExercises(false);
        }
        
      } catch (error) {
        console.error('Failed to load exercises:', error);
        const mockExercisesWithFocus = mockExercises.slice(0, 20).map(ex => ({
          ...ex,
          focus: normalizeFocusLabel(determineExerciseFocus(ex.target || '', ex.bodyPart || ''))
        }));
        setExercises(mockExercisesWithFocus);
        setFilteredExercises(mockExercisesWithFocus);
        setHasMoreExercises(false);
      } finally {
        setLoading(false);
      }
    };

    // Only load exercises when user is actually on the custom workout creation page
    // This page is only accessed when AI mode is OFF and user clicks "Create Plan"
    loadInitialExercises();
  }, []);

  // Load more exercises function
  const loadMoreExercises = useCallback(async () => {
    if (isLoadingMore || !hasMoreExercises) return;
    
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const offset = (nextPage - 1) * EXERCISES_PER_PAGE;
      
      // Try AI service first
      try {
        const aiResponse = await aiWorkoutService.filterLibrary({
          focus: undefined,
          muscles: [],
          equipment: [],
          search: '',
        }, EXERCISES_PER_PAGE, offset);
        
        if (aiResponse && aiResponse.approved_exercises && aiResponse.approved_exercises.length > 0) {
          // Use the page returned by backend; determine if more pages exist via metadata or page size
          const pageItems = aiResponse.approved_exercises;

          const newExercises = pageItems.map((ex: any) => ({
            id: ex.exerciseId,
            name: ex.name,
            gifUrl: ex.gifUrl,
            target: ex.targetMuscles,
            bodyPart: ex.bodyParts,
            equipment: ex.equipments,
            focus: determineExerciseFocus(ex.targetMuscles?.join(' ') || '', ex.bodyParts?.join(' ') || ''),
            profile_score: ex.profile_score || 1.0
          }));
          
          setExercises(prev => [...prev, ...newExercises]);
          // Keep button until a short page is returned, or use metadata.has_more if present
          const meta: any = (aiResponse as any).metadata || {};
          const hasMore = typeof meta.has_more === 'boolean' ? meta.has_more : (pageItems.length === EXERCISES_PER_PAGE);
          setHasMoreExercises(hasMore);
          setCurrentPage(nextPage);
          return;
        }
      } catch (error) {
        console.log('AI service failed for pagination, trying local service');
      }
      
      // Fallback to local service
      const localResponse = await WorkoutService.searchExercisesLocal({ 
        limit: EXERCISES_PER_PAGE,
        page: nextPage
      });
      const newExercises = localResponse.map(ex => ({
        ...ex,
        focus: normalizeFocusLabel(determineExerciseFocus(ex.target || '', ex.bodyPart || ''))
      }));
      
      setExercises(prev => [...prev, ...newExercises]);
      setHasMoreExercises(localResponse.length === EXERCISES_PER_PAGE);
      setCurrentPage(nextPage);
      
    } catch (error) {
      console.error('Failed to load more exercises:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentPage, hasMoreExercises, isLoadingMore]);

  // Disable infinite scroll; we only load on explicit button clicks to avoid continuous loading

  // Memoized focus counts for tabs
  const focusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of focusOptions) counts[f] = 0;
    for (const ex of exercises) {
      const f = ex.focus && focusOptions.includes(ex.focus as any) ? (ex.focus as typeof focusOptions[number]) : 'Full Body';
      counts[f] = (counts[f] || 0) + 1;
      // Include Push/Pull in Upper Body aggregate to make the tab useful
      if (f === 'Push' || f === 'Pull') {
        counts['Upper Body'] = (counts['Upper Body'] || 0) + 1;
      }
    }
    counts['all'] = exercises.length;
    return counts;
  }, [exercises]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasQuery = q.length > 0;
    const wantFocus = selectedFocus !== 'all' ? selectedFocus : null;

    if (!hasQuery && !wantFocus) {
      setFilteredExercises(exercises);
      return;
    }

    const next: Exercise[] = [];
    for (const ex of exercises) {
      if (wantFocus) {
        const isUpperBodyAggregate = wantFocus === 'Upper Body' && (ex.focus === 'Push' || ex.focus === 'Pull' || ex.focus === 'Upper Body');
        const isExactFocus = ex.focus === wantFocus;
        if (!isUpperBodyAggregate && !isExactFocus) continue;
      }
      if (hasQuery) {
        const name = ex.name?.toLowerCase() || '';
        const target = Array.isArray(ex.target) ? ex.target.join(', ').toLowerCase() : (ex.target || '').toLowerCase();
        const body = Array.isArray(ex.bodyPart) ? ex.bodyPart.join(', ').toLowerCase() : (ex.bodyPart || '').toLowerCase();
        const equip = Array.isArray(ex.equipment) ? ex.equipment.join(', ').toLowerCase() : (ex.equipment || '').toLowerCase();
        if (!(name.includes(q) || target.includes(q) || body.includes(q) || equip.includes(q))) continue;
      }
      next.push(ex);
    }
    setFilteredExercises(next);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [exercises, selectedFocus, searchQuery]);

  const handleDayToggle = (dayId: number) => {
    const newSelectedDays = new Set(selectedDays);
    if (newSelectedDays.has(dayId)) {
      newSelectedDays.delete(dayId);
      // Remove exercises for this day
      setSelectedExercises(prev => prev.filter(ex => ex.weekday !== dayId));
    } else {
      newSelectedDays.add(dayId);
    }
    setSelectedDays(newSelectedDays);
  };

  const handleDragStart = useCallback((e: React.DragEvent, exercise: Exercise) => {
    const payload = JSON.stringify(exercise);
    try {
      e.dataTransfer.setData('application/json', payload);
      e.dataTransfer.setData('text/plain', payload);
      e.dataTransfer.effectAllowed = 'copy';
    } catch (error) {
      console.error('Drag start error:', error);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverDay(dayId);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, dayId: number) => {
    e.preventDefault();
    setDragOverDay(dayId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dayId: number) => {
    e.preventDefault();
    setDragOverDay(null);
    
    try {
      let exerciseData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      const exercise: Exercise = JSON.parse(exerciseData);
      
      // Add exercise to selected exercises for this day
      const exerciseWithDay = { ...exercise, weekday: dayId };
      setSelectedExercises(prev => [...prev, exerciseWithDay]);
    } catch (error) {
      console.error('Drop error:', error);
    }
  }, []);

  const removeExercise = (exerciseId: string, dayId: number) => {
    setSelectedExercises(prev => 
      prev.filter(ex => !(ex.id === exerciseId && ex.weekday === dayId))
    );
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) {
      alert('Please enter a plan name');
      return;
    }

    if (selectedDays.size === 0) {
      alert('Please select at least one workout day');
      return;
    }

    try {
      setIsSaving(true);
      // Helper: compute date (YYYY-MM-DD) within the CURRENT ISO week (Mon..Sun) for a UI weekday (Mon=1..Sun=7)
      const dateInCurrentIsoWeekForWeekday = (weekdayId: number): string => {
        // Map UI weekday (Mon=1..Sun=7) to ISO index (Mon=0..Sun=6)
        const jsTarget = (weekdayId + 6) % 7; // 1->0, 2->1, ..., 7->6
        const now = new Date();
        const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        // Compute current ISO Monday in UTC
        const iso = (d: Date) => {
          const tmp = new Date(d);
          // ISO week date: get Monday
          const day = (tmp.getUTCDay() + 6) % 7; // Mon=0..Sun=6
          const monday = new Date(Date.UTC(tmp.getUTCFullYear(), tmp.getUTCMonth(), tmp.getUTCDate()))
          monday.setUTCDate(monday.getUTCDate() - day);
          return monday;
        };
        const monday = iso(base);
        const target = new Date(monday);
        target.setUTCDate(monday.getUTCDate() + jsTarget);
        const yyyy = target.getUTCFullYear();
        const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(target.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      // Build per-date entries
      const selectedDayIds = weekdays.filter(d => selectedDays.has(d.id)).map(d => d.id);
      const dateMap: Record<string, { date: string; weekdayId: number }[]> = {};
      const entries: { date: string; workout_details: any }[] = [];

      for (const dayId of selectedDayIds) {
        const date = dateInCurrentIsoWeekForWeekday(dayId);
        const exs = selectedExercises.filter(ex => ex.weekday === dayId).map(ex => ({
          exercise_id: ex.exercise_id || ex.id,
          name: ex.name,
          gifUrl: ex.gifUrl || ex.imageUrl,
          target: ex.target,
          equipment: ex.equipment,
          bodyPart: ex.bodyPart,
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          rest_seconds: 60,
        }));
        entries.push({
          date,
          workout_details: {
            plan_name: planName,
            plan_description: planDescription,
            plan_type: 'CUSTOM',
            weekday: dayId,
            exercises: exs,
          }
        });
      }

      const dates = entries.map(e => e.date);

      // Check conflicts
      const conflictRes = await WorkoutService.checkCustomPlanConflicts(dates);
      const found = conflictRes.conflicts || [];
      if (found.length > 0) {
        setConflicts(found);
        setPendingEntries(entries);
        setShowConfirm(true);
        setIsSaving(false);
        return;
      }

      // No conflicts → save directly
      const saveRes = await WorkoutService.saveCustomPlan(entries, false);
      if (saveRes.ok) {
        try { (WorkoutService as any).__cache?.delete?.('workout_plan'); } catch {}
        const affected = (saveRes.dates || []).join(', ');
        setToast({ visible: true, type: 'success', message: `Your new plan has been created for: ${affected}` });
        navigate('/workouts');
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      setToast({ visible: true, type: 'error', message: 'Failed to save workout plan. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplaceConfirm = async () => {
    if (!pendingEntries) {
      setShowConfirm(false);
      return;
    }
    try {
      setIsSaving(true);
      const saveRes = await WorkoutService.saveCustomPlan(pendingEntries, true);
      if (saveRes.ok) {
        try { (WorkoutService as any).__cache?.delete?.('workout_plan'); } catch {}
        const affected = (saveRes.dates || []).join(', ');
        setToast({ visible: true, type: 'success', message: `Your new plan has replaced the existing plan for: ${affected}` });
        setShowConfirm(false);
        setPendingEntries(null);
        navigate('/workouts');
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      console.error(e);
      setToast({ visible: true, type: 'error', message: 'Failed to replace plan. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplaceCancel = () => {
    setShowConfirm(false);
    setPendingEntries(null);
    setToast({ visible: true, type: 'error', message: 'Plan creation cancelled. Existing plan kept unchanged.' });
  };

  // Loading skeleton component
  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="bg-[#374151] rounded-lg p-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-700 rounded-lg"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-700 rounded w-1/2"></div>
            </div>
            <div className="w-4 h-4 bg-gray-700 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
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
          <div className="mb-8">
            <h1 className="text-[36px] font-extrabold">Create Custom Workout Plan</h1>
            <p className="text-lg text-gray-400">Drag and drop exercises to create your personalized workout plan</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Exercise Library Skeleton */}
            <div className="lg:col-span-1">
              <div className="bg-[#1E1E1E] rounded-2xl p-6 sticky top-20 h-[calc(100vh-120px)] flex flex-col shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
                <div className="flex items-center justify-between mb-6 flex-shrink-0">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">Exercise Library</h3>
                    <p className="text-gray-400 text-sm">Loading exercises...</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2">
                  <LoadingSkeleton />
                </div>
              </div>
            </div>

            {/* Workout Plan Builder Skeleton */}
            <div className="lg:col-span-2">
              <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
                <h3 className="text-xl font-bold text-white mb-4">Workout Plan Builder</h3>
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-20 bg-gray-700 rounded"></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      <Toast
        isVisible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
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
        <div className="mb-8">
          <h1 className="text-[36px] font-extrabold">Create Custom Workout Plan</h1>
          <p className="text-lg text-gray-400">Drag and drop exercises to create your personalized workout plan</p>
        </div>

        {/* Plan Details */}
        <div className="bg-[#1E1E1E] rounded-2xl p-6 mb-8 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
          <h2 className="text-xl font-bold text-white mb-4">Plan Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Plan Name</label>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Enter plan name..."
                className="w-full bg-black/20 text-white px-4 py-3 rounded-lg border border-white/20 focus:border-[#EF4444] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Description</label>
              <input
                type="text"
                value={planDescription}
                onChange={(e) => setPlanDescription(e.target.value)}
                placeholder="Enter plan description..."
                className="w-full bg-black/20 text-white px-4 py-3 rounded-lg border border-white/20 focus:border-[#EF4444] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Exercise Library - Fixed Position */}
          <div className="lg:col-span-1">
            <Suspense fallback={
            <div className="bg-[#1E1E1E] rounded-2xl p-6 sticky top-20 h-[calc(100vh-120px)] flex flex-col shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">Exercise Library</h3>
                    <p className="text-gray-400 text-sm">Loading exercises...</p>
                </div>
              </div>
                <div className="flex-1 overflow-y-auto pr-2">
                  <div className="space-y-3">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div key={index} className="bg-[#374151] rounded-lg p-4 animate-pulse">
                      <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gray-700 rounded-lg"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                            </div>
                          <div className="w-4 h-4 bg-gray-700 rounded"></div>
                      </div>
                    </div>
                    ))}
                  </div>
              </div>
            </div>
            }>
              <OptimizedExerciseLibrary
                exercises={filteredExercises}
                searchQuery={searchQuery}
                selectedFocus={selectedFocus}
                focusCounts={focusCounts}
                focusOptions={focusOptions}
                onSearchChange={setSearchQuery}
                onFocusChange={setSelectedFocus}
                onDragStart={handleDragStart}
                onLoadMore={loadMoreExercises}
                hasMoreExercises={hasMoreExercises}
                isLoadingMore={isLoadingMore}
              />
            </Suspense>
          </div>

          {/* Workout Plan Builder */}
          <div className="lg:col-span-2">
            <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <h3 className="text-xl font-bold text-white mb-4">Workout Plan Builder</h3>
              
              {/* Day Selection */}
              <div className="mb-6">
                <h4 className="text-gray-400 text-sm mb-3">Select Workout Days</h4>
                <div className="flex flex-wrap gap-2">
                  {weekdays.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => handleDayToggle(day.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedDays.has(day.id)
                          ? 'bg-[#EF4444] text-white'
                          : 'bg-black/20 text-gray-400 hover:bg-[#374151]'
                      }`}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* Workout Days */}
              <div className="space-y-4">
                {weekdays
                  .filter(day => selectedDays.has(day.id))
                  .map((day) => (
                    <div
                      key={day.id}
                      className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                        dragOverDay === day.id
                          ? 'border-[#EF4444] bg-[#EF4444]/10'
                          : 'border-gray-600 bg-black/20'
                      }`}
                      onDragEnter={(e) => handleDragEnter(e, day.id)}
                      onDragOver={(e) => handleDragOver(e, day.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day.id)}
                    >
                      <h4 className="text-white font-semibold mb-3">{day.name}</h4>
                      
                      {selectedExercises.filter(ex => ex.weekday === day.id).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p>Drag exercises here</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedExercises
                            .filter(ex => ex.weekday === day.id)
                            .map((exercise, index) => (
                              <div
                                key={`${exercise.id}-${day.id}`}
                                className="bg-[#374151] rounded-lg p-3 flex items-center justify-between"
                              >
                                <div className="flex items-center gap-3">
                                  {/* Exercise GIF/Image */}
                                  <div className="w-12 h-12 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                                    {exercise.gifUrl ? (
                                      <img
                                        src={exercise.gifUrl}
                                        alt={exercise.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : exercise.imageUrl ? (
                                      <img
                                        src={exercise.imageUrl}
                                        alt={exercise.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                                        <span className="text-gray-400 text-xs">🏋️</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 bg-[#EF4444] rounded-full flex items-center justify-center text-white text-xs font-bold">
                                        {index + 1}
                                      </div>
                                      <h5 className="text-white font-medium text-sm truncate">{exercise.name}</h5>
                                    </div>
                                    <p className="text-gray-400 text-xs truncate">{exercise.target || exercise.category}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeExercise(exercise.id || '', day.id)}
                                  className="text-gray-400 hover:text-red-400 transition-colors ml-2"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={() => navigate('/workouts')}
            className="px-8 py-3 border border-white/30 text-gray-200 hover:bg-white/10 rounded-lg font-bold transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSavePlan}
            className="px-8 py-3 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-lg font-bold transition-all duration-200"
          >
            Save Workout Plan
          </button>
        </div>

        {/* Confirmation Dialog */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-[#1E1E1E] border border-gray-700 rounded-2xl max-w-lg w-full p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <h3 className="text-xl font-bold text-white mb-2">Replace existing plan?</h3>
              <p className="text-gray-300 mb-4">You can have only one active plan per date.</p>
              <div className="bg-[#374151] rounded-lg p-4 mb-4 border border-gray-700 max-h-60 overflow-auto">
                <p className="text-sm text-gray-400 mb-2">Conflicts found on:</p>
                <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
                  {conflicts.map(c => (
                    <li key={`${c.date}-${c.plan_type}`}>{c.date} ({c.plan_type})</li>
                  ))}
                </ul>
              </div>
              <p className="text-gray-300 mb-6">Do you want to replace the existing plan with your new <span className="font-semibold">Custom</span> plan for these date(s)?</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleReplaceCancel}
                  className="px-5 py-2 rounded-lg border border-white/20 text-gray-200 hover:bg-white/10"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReplaceConfirm}
                  className="px-5 py-2 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white"
                  disabled={isSaving}
                >
                  {isSaving ? 'Replacing...' : 'Replace'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateWorkoutPlanPage;
