export interface Exercise {
  id: string;
  exercise_id?: string; // Backend exercise ID
  name: string;
  // Frontend fields (for mock data compatibility)
  category?: string;
  type?: string;
  imageUrl?: string;
  // Backend fields (actual API response)
  gifUrl?: string;
  target?: string | string[];
  equipment?: string | string[];
  bodyPart?: string | string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  difficulty?: string; // Exercise difficulty level
  force?: string; // Type of force (push, pull, static, etc.)
  focus?: string; // Exercise focus category (Upper Body, Lower Body, Full Body, Push, Pull)
  // Planner-only (drag/drop) field
  weekday?: number;
  // Workout-specific fields
  sets?: number;
  reps?: number;
}

// AI Workout Types
export interface ExerciseOut {
  exerciseId: string;
  name: string;
  gifUrl?: string;
  targetMuscles: string[];
  bodyParts: string[];
  equipments: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

export interface PlanExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps?: string; // "8-12"
  duration_seconds?: number;
  rest_seconds?: number;
  notes?: string;
  gifUrl?: string;
}

export interface PlanDay {
  day: string; // "Monday"
  focus?: string;
  exercises: PlanExercise[];
}

export interface GeneratePlanResponse {
  week: PlanDay[];
  summary?: string;
}

export interface FilterLibraryResponse {
  approved_exercises: ExerciseOut[];
  reason?: string;
}

export interface SuggestAlternativeResponse {
  alternatives: ExerciseOut[];
  rationale?: string;
}

export interface WorkoutDay {
  date: string;
  dayOfWeek: string;
  weekday: number; // Backend weekday number
  exercises: Exercise[];
  isCompleted: boolean;
  isToday: boolean;
  isSelected: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  type: 'weekly' | 'monthly';
  days: WorkoutDay[];
  startDate: string;
  endDate: string;
  // Optional AI metadata persisted by backend
  ai_enabled?: boolean;
  ai_anchor_weekday?: number; // 0=Mon..6=Sun
  last_generated_anchor?: string; // YYYY-MM-DD
  last_generated_monday?: string; // YYYY-MM-DD (back-compat)
}

export interface WorkoutSession {
  id: string;
  date: string;
  exercises: Exercise[];
  duration: number;
  caloriesBurned: number;
  isCompleted: boolean;
}

export interface CalendarView {
  currentMonth: string;
  currentYear: number;
  weeks: WorkoutDay[][];
}
