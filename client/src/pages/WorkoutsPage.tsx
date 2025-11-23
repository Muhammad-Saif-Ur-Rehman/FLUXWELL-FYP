import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import logoIcon from '../assets/images/logo-icon.svg';
import WorkoutCalendar from '../components/workout/WorkoutCalendar';
import CurrentWorkoutPlan from '../components/workout/CurrentWorkoutPlan';
import AIGeneratedPlan from '../components/workout/AIGeneratedPlan';
import ExerciseAlternativesModal from '../components/workout/ExerciseAlternativesModal';
import Toast from '../components/ui/Toast';
import { WorkoutDay, Exercise, WorkoutSession, ExerciseOut, PlanDay, PlanExercise } from '../types/workout';
import { WorkoutService } from '../services/workoutService';
import { aiWorkoutService } from '../services/aiWorkoutService';

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

const WorkoutsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [formProfilePic, setFormProfilePic] = useState<string | null>(null);
  
  // Workout state
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutDay[]>([]);
  const [todaysWorkout, setTodaysWorkout] = useState<WorkoutSession | null>(null);
  const [selectedDay, setSelectedDay] = useState<WorkoutDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Helper functions for toasts
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  // AI Workout state
  const [aiPlans, setAiPlans] = useState(() => {
    try { return localStorage.getItem('ai_plans') === 'true'; } catch { return false; }
  });
  const [lastGeneratedMonday, setLastGeneratedMonday] = useState<string | null>(null);
  const [anchorWeekday, setAnchorWeekday] = useState<number>(0); // 0=Mon..6=Sun
  const [lastGeneratedAnchor, setLastGeneratedAnchor] = useState<string | null>(null);
  const [aiGeneratedPlan, setAiGeneratedPlan] = useState<PlanDay[]>([]);
  const [aiPlanSummary, setAiPlanSummary] = useState<string>('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  // AI overlap confirmation
  const [showAIConfirm, setShowAIConfirm] = useState(false);
  const [aiConflicts, setAIConflicts] = useState<{ date: string; plan_type: string }[]>([]);
  // When true, skip conflict check once (used after user confirms)
  const [skipAIConflictOnce, setSkipAIConflictOnce] = useState(false);
  // Derived UI flags
  const hasSavedPlan = useMemo(() => {
    if (!workoutPlan || workoutPlan.length === 0) return false;
    return workoutPlan.some(d => (d.exercises || []).length > 0);
  }, [workoutPlan]);
  // Suppress a single automatic AI generation after saving
  const [suppressAIAutoGenOnce, setSuppressAIAutoGenOnce] = useState(false);
  
  // Exercise alternatives modal
  const [alternativesModalOpen, setAlternativesModalOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<ExerciseOut[]>([]);
  const [alternativesRationale, setAlternativesRationale] = useState<string>('');
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [skippedExercise, setSkippedExercise] = useState<{ exercise: PlanExercise, dayIndex: number, exerciseIndex: number } | null>(null);

  useEffect(() => {
    // Check if there's a selected exercise from navigation
    if (location.state?.selectedExercise) {
      const exercise = location.state.selectedExercise;
        if (selectedDay) {
        handleExerciseSelect(exercise);
        }
      // Clear the navigation state
      navigate('/workouts', { replace: true, state: {} });
      }
  }, [location.state, selectedDay, navigate]);
    
  useEffect(() => {
    const checkWorkoutProfile = async () => {
      try {
        const userStr = localStorage.getItem('user');
        const accessToken = localStorage.getItem('access_token');
        if (!userStr || !accessToken) {
          navigate('/login');
          return;
        }
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);
        const userId = parsedUser?.id || parsedUser?._id;
        if (!userId) {
          navigate('/login');
          return;
        }

        const resp = await fetch(API_ENDPOINTS.WORKOUT.STATUS, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!resp.ok) {
          navigate('/onboarding/workout', { replace: true });
          return;
        }

        const status = await resp.json();
        if (!status?.profile_exists) {
          navigate('/onboarding/workout', { replace: true });
          return;
        }

        // Load onboarding data to pull form user's profile picture
        try {
          if (accessToken) {
            const ob = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (ob.ok) {
              const data = await ob.json();
              const step1 = data?.step1 || {};
              if (step1?.profile_picture_url) setFormProfilePic(step1.profile_picture_url);
            }
          }
        } catch {}

        // Load workout data
        await loadWorkoutData();
        setIsLoading(false);
      } catch (e) {
        navigate('/onboarding/workout', { replace: true });
      }
    };

    checkWorkoutProfile();
  }, [navigate]);

  // Load exercises on-demand when AI mode is toggled ON
  const loadExercisesForAI = async () => {
    try {
      setIsLoadingExercises(true);
      console.log('Loading exercises for AI mode...');
      const aiLibrary = await aiWorkoutService.filterLibrary({ search: "" }, 40);
      console.log('AI Library response:', aiLibrary);
      console.log('AI Library exercises count:', aiLibrary.approved_exercises?.length || 0);
      
      if (aiLibrary.approved_exercises && aiLibrary.approved_exercises.length > 0) {
        const mappedExercises = aiLibrary.approved_exercises.map(ex => ({
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
        console.log('Mapped exercises:', mappedExercises.length);
        setExercises(mappedExercises);
      } else {
        console.log('AI service returned no exercises, falling back to local service');
        throw new Error('No exercises from AI service');
      }
    } catch (error) {
      console.error('Error loading AI exercise library, falling back to local:', error);
      // Fallback to local service if AI service fails
      try {
        console.log('Loading local exercise library...');
        const exercisesData = await WorkoutService.searchExercisesLocal({ limit: 50 });
        console.log('Local exercises count:', exercisesData.length);
        const mappedExercises = exercisesData.map(ex => ({
          ...ex,
          focus: determineExerciseFocus(ex.target || '', ex.bodyPart || '')
        }));
        setExercises(mappedExercises);
      } catch (fallbackError) {
        console.error('Error loading local exercise library:', fallbackError);
        setExercises([]);
      }
    } finally {
      setIsLoadingExercises(false);
    }
  };

  // Persist toggle locally for immediate restoration on refresh
  useEffect(() => {
    try { localStorage.setItem('ai_plans', aiPlans ? 'true' : 'false'); } catch {}
    // Persist to backend and reload to possibly auto-generate when toggled ON
    (async () => {
      try {
        await aiWorkoutService.setAIMode(aiPlans ? 'ai' : 'assist');
      } catch {}
      
      if (aiPlans) {
        // AI mode is ON - load exercises for AI plan generation
        await loadExercisesForAI();
        // Auto-generate plan when toggled ON unless suppressed
        if (!suppressAIAutoGenOnce && !isGeneratingPlan && (aiGeneratedPlan.length === 0)) {
          await generateAIPlan();
        }
      } else {
        // AI mode is OFF - clear exercises to save memory
        setExercises([]);
      }
      
      // Reload workout data after toggling
      try { await loadWorkoutData(); } catch {}
    })();
  }, [aiPlans]);

  const loadWorkoutData = async () => {
    try {
      // Always fetch plan and today's session first
      const [workoutPlanData, todaysSession] = await Promise.all([
        WorkoutService.getWorkoutPlan(),
        WorkoutService.getTodaysSession()
      ]);

      // Hydrate AI flags
      try {
        // Never force-toggle AI ON from hydration immediately after saving
        if (typeof workoutPlanData.ai_enabled === 'boolean') {
          if (!suppressAIAutoGenOnce) {
            setAiPlans(workoutPlanData.ai_enabled);
            try { localStorage.setItem('ai_plans', workoutPlanData.ai_enabled ? 'true' : 'false'); } catch {}
          }
        }
        if (typeof workoutPlanData.last_generated_monday === 'string') {
          setLastGeneratedMonday(workoutPlanData.last_generated_monday.slice(0,10));
        }
        if (typeof workoutPlanData.ai_anchor_weekday === 'number') {
          setAnchorWeekday(workoutPlanData.ai_anchor_weekday);
        }
        if (typeof workoutPlanData.last_generated_anchor === 'string') {
          setLastGeneratedAnchor(workoutPlanData.last_generated_anchor.slice(0,10));
        }
      } catch {}

      // Auto-generate when enabled and needed (first-time or weekly refresh)
      try {
        const totalExercises = (workoutPlanData.days || []).reduce((sum: number, d: any) => sum + ((d.exercises || []).length || 0), 0);
        const enabled = Boolean(workoutPlanData.ai_enabled);
        const now = new Date();
        const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const dow = base.getUTCDay();
        const diff = base.getUTCDate() - dow + (dow === 0 ? -6 : 1);
        const mondayUtc = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), diff));
        const idx = (typeof workoutPlanData.ai_anchor_weekday === 'number') ? workoutPlanData.ai_anchor_weekday : 0;
        const anchorDateUtc = new Date(mondayUtc);
        anchorDateUtc.setUTCDate(mondayUtc.getUTCDate() + ((idx % 7) + 7) % 7);
        const anchorKey = anchorDateUtc.toISOString().slice(0,10);
        const lastAnchor = (workoutPlanData.last_generated_anchor || workoutPlanData.last_generated_monday || '').slice(0,10);
        const isAnchorToday = now.toISOString().slice(0,10) === anchorKey;
        const needsGen = (enabled && (totalExercises === 0 || (isAnchorToday && lastAnchor !== anchorKey)));
        if (!suppressAIAutoGenOnce && needsGen) {
          setAiPlans(true);
          try { localStorage.setItem('ai_plans', 'true'); } catch {}
          await generateAIPlan();
          setLastGeneratedAnchor(anchorKey);
          // While user reviews AI plan, skip rendering old plan below
        } else {
          // Render existing plan and select today
          if (workoutPlanData && workoutPlanData.days) {
            const transformedDays = workoutPlanData.days.map((day: any) => {
              const now = new Date();
              // Compute local Monday (Mon=1..Sun=0) start of current week
              const jsDow = now.getDay(); // 0..6
              const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow; // move to Monday
              const currentWeekStart = new Date(now);
              currentWeekStart.setHours(0,0,0,0);
              currentWeekStart.setDate(currentWeekStart.getDate() + mondayOffset);
              const dayDate = new Date(currentWeekStart);
              dayDate.setDate(currentWeekStart.getDate() + (day.weekday || 0));
              dayDate.setHours(0,0,0,0);
              const isToday = now.toDateString() === dayDate.toDateString();
              const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;
              return {
                date: dateStr,
                dayOfWeek: day.name,
                weekday: day.weekday,
                exercises: day.exercises || [],
                isCompleted: false,
                isToday,
                isSelected: false
              };
            });
            setWorkoutPlan(transformedDays);
            const todayDay = transformedDays.find(d => d.isToday);
            if (todayDay) setSelectedDay(todayDay);
          }
        }
      } catch {}

      // Only load exercises if AI mode is ON or if we need them for AI plan generation
      const shouldLoadExercises = aiPlans || (workoutPlanData.ai_enabled && (workoutPlanData.days || []).reduce((sum: number, d: any) => sum + ((d.exercises || []).length || 0), 0) === 0);
      
      if (shouldLoadExercises) {
        try {
          // Load exercises for AI plan generation
          console.log('Loading AI exercise library for plan generation...');
          const aiLibrary = await aiWorkoutService.filterLibrary({ search: "" }, 40);
          console.log('AI Library response:', aiLibrary);
          console.log('AI Library exercises count:', aiLibrary.approved_exercises?.length || 0);
          
          if (aiLibrary.approved_exercises && aiLibrary.approved_exercises.length > 0) {
            const mappedExercises = aiLibrary.approved_exercises.map(ex => ({
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
            console.log('Mapped exercises:', mappedExercises.length);
            setExercises(mappedExercises);
          } else {
            console.log('AI service returned no exercises, falling back to local service');
            throw new Error('No exercises from AI service');
          }
        } catch (error) {
          console.error('Error loading AI exercise library, falling back to local:', error);
          // Fallback to local service if AI service fails
          try {
            console.log('Loading local exercise library...');
            const exercisesData = await WorkoutService.searchExercisesLocal({ limit: 50 });
            console.log('Local exercises count:', exercisesData.length);
            const mappedExercises = exercisesData.map(ex => ({
              ...ex,
              focus: determineExerciseFocus(ex.target || '', ex.bodyPart || '')
            }));
            setExercises(mappedExercises);
          } catch (fallbackError) {
            console.error('Error loading local exercise library:', fallbackError);
            setExercises([]);
          }
        }
      } else {
        // AI mode is OFF and we have existing exercises, no need to load more
        // This optimization prevents unnecessary database calls when user only wants to view existing plans
        console.log('AI mode is OFF, skipping exercise loading to optimize performance');
        setExercises([]);
      }
    } catch (error) {
      console.error('Error loading workout data:', error);
      setError('Failed to load workout data. Please try again.');
      setTimeout(() => setError(null), 3000);
      // Fallback to empty data with proper dates - NO MOCK WORKOUT DATA
      console.log('Falling back to empty data');
      setExercises([]);
      
      // Create empty workout plan with proper dates
      const today = new Date();
      const currentWeekStart = new Date(today);
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      currentWeekStart.setDate(diff);
      const emptyDays = Array.from({ length: 7 }, (_, i) => {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);
        return {
          date: dayDate.toISOString().split('T')[0],
          dayOfWeek: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i],
          weekday: i,
          exercises: [],
          isCompleted: false,
          isToday: today.toDateString() === dayDate.toDateString(),
          isSelected: false
        };
      });
      setWorkoutPlan(emptyDays);
      const todayDay = emptyDays.find(d => d.isToday);
      if (todayDay) setSelectedDay(todayDay);
    }
  };

  const generateAIPlan = async () => {
    try {
      setIsGeneratingPlan(true);
      setError(null);
      
      const planResponse = await aiWorkoutService.generatePlan();
      setAiGeneratedPlan(planResponse.week);
      setAiPlanSummary(planResponse.summary || '');
      
      showToast('AI workout plan generated successfully!', 'success');
    } catch (error) {
      console.error('Error generating AI plan:', error);
      showToast('AI service unavailable, try again', 'error');
      // Keep AI toggle state as-is; user controls it
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleSaveAIPlan = async (options?: { forceReplace?: boolean }) => {
    try {
      setIsSavingPlan(true);
      setError(null);
      const forceReplace = Boolean(options?.forceReplace);
      // Before saving, check for overlaps in this ISO week unless user already confirmed
      if (!skipAIConflictOnce && !forceReplace) {
        try {
          const now = new Date();
          const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          const dow = base.getUTCDay();
          const diff = base.getUTCDate() - dow + (dow === 0 ? -6 : 1);
          const mondayUtc = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), diff));
          const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(mondayUtc);
            d.setUTCDate(mondayUtc.getUTCDate() + i);
            return d.toISOString().slice(0,10);
          });
          const conflictRes = await WorkoutService.checkCustomPlanConflicts(weekDates);
          const found = conflictRes.conflicts || [];
          if (found.length > 0) {
            setAIConflicts(found);
            setShowAIConfirm(true);
            return; // pause saving until user confirms
          }
        } catch {}
      }
      
      // Convert AI plan to workout plan format
      const workoutPlanData = {
        days: aiGeneratedPlan.map((day, index) => ({
          name: day.day,
          weekday: index,
          exercises: day.exercises.map(ex => ({
            exercise_id: ex.exerciseId,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            duration_seconds: ex.duration_seconds,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes,
            gifUrl: ex.gifUrl
          }))
        }))
      };
      
      // Save to workout plan using existing endpoint
      const response = await fetch(API_ENDPOINTS.WORKOUT.PLAN, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(workoutPlanData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save workout plan');
      }
      
      showToast('AI workout plan saved successfully!', 'success');
      // Clear generator and show saved plan immediately
      setAiGeneratedPlan([]);
      setIsGeneratingPlan(false);
      setShowAIConfirm(false);
      setAIConflicts([]);
      setSkipAIConflictOnce(false);
      try { (WorkoutService as any).__cache?.delete?.('workout_plan'); } catch {}
      // Turn off AI toggle to return user to normal plan view automatically
      // Persist server-side mode first to avoid hydration flipping it back on
      setSuppressAIAutoGenOnce(true);
      try { await aiWorkoutService.setAIMode('assist'); } catch {}
      setAiPlans(false);
      await loadWorkoutData();
      // Now that data is reloaded, allow future auto-gen again
      setSuppressAIAutoGenOnce(false);
      try {
        const session = await WorkoutService.getTodaysSession();
        setTodaysWorkout(session);
      } catch {}
      const today = new Date().getDay(); // 0=Sun ... 6=Sat
      const isWeekend = today === 0 || today === 6;
      if (isWeekend) {
        showToast("It's a relaxing day! Your plan starts Monday.", 'success');
      }
    } catch (error) {
      console.error('Error saving AI plan:', error);
      showToast('Failed to save workout plan. Please try again.', 'error');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleConfirmAISave = async () => {
    setShowAIConfirm(false);
    // Proceed to save, which will replace overlaps server-side
    setSkipAIConflictOnce(true);
    await handleSaveAIPlan({ forceReplace: true });
  };
  const handleCancelAISave = () => {
    setShowAIConfirm(false);
    setAIConflicts([]);
    showToast('AI save cancelled. Existing plan kept unchanged.', 'error');
  };

  const handleExerciseSkip = async (exercise: PlanExercise, dayIndex: number, exerciseIndex: number) => {
    try {
      setSkippedExercise({ exercise, dayIndex, exerciseIndex });
      setIsLoadingAlternatives(true);
      setAlternativesModalOpen(true);
      
      // Get the day's focus for better context
      const dayFocus = aiGeneratedPlan[dayIndex]?.focus || 'Full Body';
      const reason = `User chose to skip this exercise from ${dayFocus} day`;
      
      const alternativesResponse = await aiWorkoutService.suggestAlternative(
        exercise,
        reason,
        dayFocus
      );
      
      setAlternatives(alternativesResponse.alternatives);
      setAlternativesRationale(alternativesResponse.rationale || '');
    } catch (error) {
      console.error('Error getting alternatives:', error);
      showToast('AI service unavailable, try again', 'error');
      // Close modal on error
      setAlternativesModalOpen(false);
      setSkippedExercise(null);
    } finally {
      setIsLoadingAlternatives(false);
    }
  };

  const handleSelectAlternative = (alternative: ExerciseOut) => {
    if (skippedExercise) {
      // Replace the skipped exercise with the alternative
      const newPlan = [...aiGeneratedPlan];
      const day = newPlan[skippedExercise.dayIndex];
      if (day) {
        // Preserve the original exercise parameters
        const originalExercise = day.exercises[skippedExercise.exerciseIndex];
        day.exercises[skippedExercise.exerciseIndex] = {
          exerciseId: alternative.exerciseId,
          name: alternative.name,
          sets: originalExercise.sets,
          reps: originalExercise.reps,
          duration_seconds: originalExercise.duration_seconds,
          rest_seconds: originalExercise.rest_seconds,
          notes: originalExercise.notes,
          gifUrl: alternative.gifUrl
        };
        setAiGeneratedPlan(newPlan);
      }
      
      showToast(`Replaced exercise with ${alternative.name}`, 'success');
    }
    
    setAlternativesModalOpen(false);
    setSkippedExercise(null);
  };

  const handleExerciseSkipFromToday = (exerciseId: string) => {
    console.log('Exercise skipped from Today\'s plan:', exerciseId);
  };

  // Placeholder for handleExerciseSelect
  const handleExerciseSelect = (exercise: Exercise) => {
    console.log('Selected exercise:', exercise);
  };

  const handleExerciseComplete = async (exerciseId: string) => {
    try {
      setError(null);
      const success = await WorkoutService.completeExercise(exerciseId);
      if (success) {
        // Refresh today's session to show updated completion status
        const updatedSession = await WorkoutService.getTodaysSession();
        setTodaysWorkout(updatedSession);
        setSuccess('Exercise marked as complete!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error) {
      setError('Failed to mark exercise as complete. Please try again.');
      setTimeout(() => setError(null), 3000);
      console.error('Error completing exercise:', error);
    }
  };

  const handleSearchExercises = () => {
    navigate('/exercises/search');
  };

  const handleCreatePlan = () => {
    navigate('/workouts/create');
  };

  const profileImageUrl = useMemo(() => {
    if (!user) return null;
    const provider = user?.auth_provider;
    if (provider === 'google' || provider === 'fitbit') return user?.profile_picture_url || null;
    return formProfilePic || null;
  }, [user, formProfilePic]);

  const handleDaySelect = (day: WorkoutDay) => {
    setSelectedDay(day);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#110E0E] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading workouts...</p>
        </div>
      </div>
    );
  }

  // When AI toggle is ON, always show the generator section so user can generate/modify AI plan
  const showGenerator = !!aiPlans;

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header (Dashboard-like) */}
      <header className="w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
        <div className="max-w-[1920px] mx-auto px-10 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
            <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
              <span className="text-white">Flux</span>
              <span className="text-[#EB4747]">Well</span>
            </h2>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link to="/workouts" className="text-[#EB4747] font-semibold">Workouts</Link>
            <Link to="/nutrition" className="text-gray-400 hover:text-white">Nutrition</Link>
            <Link to="/realtime" className="text-gray-400 hover:text-white">Tracking</Link>
            <Link to="/coach" className="text-gray-400 hover:text-white">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
            <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
            <Link to="/practice" className="text-gray-400 hover:text-white">Practice Room</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              localStorage.removeItem('access_token');
              localStorage.removeItem('user');
              localStorage.removeItem('onboarding_completed');
              localStorage.removeItem('onboarding_step1');
              localStorage.removeItem('onboarding_step2');
              localStorage.removeItem('onboarding_data');
              navigate('/');
            }} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={user?.full_name || 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold">{user?.full_name?.[0] || 'U'}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-6 md:px-10 pt-[73px] pb-10">
                 <h2 className="text-[36px] font-extrabold mt-8 mb-4">Workout Planner 💪</h2>
         <p className="text-lg text-gray-400 mb-8">Plan, track, and complete your workouts to achieve your fitness goals.</p>
         
         {/* Error and Success Messages */}
         {error && (
           <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
             <p className="text-red-400 text-sm">{error}</p>
           </div>
         )}
         {success && (
           <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
             <p className="text-green-400 text-sm">{success}</p>
           </div>
         )}

        {/* AI Toggle and Action Buttons */}
        <div className="flex items-center justify-between mb-8">
          {/* AI Toggle */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">AI Plans</span>
              <button
                onClick={() => setAiPlans(!aiPlans)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  aiPlans ? 'bg-[#EF4444]' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    aiPlans ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-400">
                {aiPlans ? 'ON' : 'OFF'}
              </span>
            </div>
            
            {aiPlans && (
              <div className="flex items-center gap-2">
                {isLoadingExercises ? (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-yellow-500">Loading Exercises...</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></div>
                    <span className="text-xs text-[#10B981]">AI Active</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSearchExercises}
              className="px-6 py-3 border border-white/30 text-gray-200 hover:bg-white/10 rounded-lg font-bold transition-all duration-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search Exercises
            </button>
            {!aiPlans && (
              <button
                onClick={handleCreatePlan}
                className="px-6 py-3 bg-[#EB4747] hover:bg-[#d13f3f] text-white rounded-lg font-bold transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Plan
              </button>
            )}
            <button
              onClick={loadWorkoutData}
              className="px-6 py-3 border border-white/30 text-gray-200 hover:bg-white/10 rounded-lg font-bold transition-all duration-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* AI-Generated Plan (when toggle is ON) */}
        {showGenerator && (
          <div className="mb-8">
            {aiGeneratedPlan.length > 0 ? (
              <AIGeneratedPlan
                plan={aiGeneratedPlan}
                summary={aiPlanSummary}
                onSavePlan={handleSaveAIPlan}
                onExerciseSkip={handleExerciseSkip}
                isSaving={isSavingPlan}
              />
            ) : (
              <div className="bg-[#1E1E1E] rounded-2xl p-8 text-center shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
                {isGeneratingPlan ? (
                  <div>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
                    <h3 className="text-xl font-bold text-white mb-2">Generating Your AI Workout Plan</h3>
                    <p className="text-gray-400">This may take a few moments...</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-6xl mb-4">🤖</div>
                    <h3 className="text-xl font-bold text-white mb-2">Ready to Generate AI Plan</h3>
                    <p className="text-gray-400 mb-4">Click the button below to create your personalized workout plan</p>
                    <button
                      onClick={generateAIPlan}
                      className="px-6 py-3 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-lg font-bold transition-all duration-200"
                    >
                      Generate AI Plan
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Workout Calendar (when toggle is OFF) */}
        {!showGenerator && (
          <div className="mb-8">
            <WorkoutCalendar
              workoutDays={workoutPlan}
              onDaySelect={handleDaySelect}
              selectedDay={selectedDay}
            />
          </div>
        )}

        {/* Current Workout Plan (when toggle is OFF) */}
        {!showGenerator && (
          <div className="mb-8">
            <CurrentWorkoutPlan
              selectedDay={selectedDay}
              onExerciseComplete={handleExerciseComplete}
              onExerciseSkip={handleExerciseSkipFromToday}
             />
           </div>
        )}

        {/* AI Plan Status */}
        <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                {aiPlans ? 'AI-Generated Workout Plan' : 'Assisted Manual Planning'}
              </h3>
              <p className="text-gray-400">
                {aiPlans 
                  ? 'Your personalized workout plan is generated by AI based on your assessment and preferences'
                  : 'Create custom workout plans manually with AI-assisted exercise recommendations'
                }
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${aiPlans ? 'bg-[#10B981] animate-pulse' : 'bg-gray-500'}`}></div>
              <span className={`text-sm font-medium ${aiPlans ? 'text-[#10B981]' : 'text-gray-400'}`}>
                {aiPlans ? 'Active' : 'Manual Mode'}
              </span>
            </div>
          </div>
          <div className="mt-4 p-4 bg-[#374151] rounded-lg border border-gray-700">
            <p className="text-gray-300 text-sm">
              💡 <strong>Note:</strong> {aiPlans 
                ? 'You can edit the AI-generated plan above and save it to your workout library.'
                : 'Toggle AI Plans ON to get a fully generated workout plan, or use manual mode to build custom plans.'
              }
            </p>
          </div>
        </div>
      </main>

      {/* Exercise Alternatives Modal */}
      <ExerciseAlternativesModal
        isOpen={alternativesModalOpen}
        onClose={() => {
          setAlternativesModalOpen(false);
          setSkippedExercise(null);
        }}
        alternatives={alternatives}
        rationale={alternativesRationale}
        onSelectAlternative={handleSelectAlternative}
        isLoading={isLoadingAlternatives}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={true}
          onClose={hideToast}
          duration={3000}
        />
      )}

      {/* AI Save Confirmation Dialog */}
      {showAIConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-[#1E1E1E] border border-gray-700 rounded-2xl max-w-lg w-full p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-xl font-bold text-white mb-2">Replace existing plan for this week?</h3>
            <p className="text-gray-300 mb-4">Saving the AI plan will replace any existing plan entries for the current week.</p>
            <div className="bg-[#374151] rounded-lg p-4 mb-4 border border-gray-700 max-h-60 overflow-auto">
              <p className="text-sm text-gray-400 mb-2">Conflicts detected on:</p>
              <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
                {aiConflicts.map(c => (
                  <li key={`${c.date}-${c.plan_type}`}>{c.date} ({c.plan_type})</li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelAISave}
                className="px-5 py-2 rounded-lg border border-white/20 text-gray-200 hover:bg-white/10"
                disabled={isSavingPlan}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAISave}
                className="px-5 py-2 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white"
                disabled={isSavingPlan}
              >
                {isSavingPlan ? 'Saving...' : 'Replace & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutsPage;


