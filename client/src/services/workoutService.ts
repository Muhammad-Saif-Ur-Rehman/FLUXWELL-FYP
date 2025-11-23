import { API_ENDPOINTS } from "../config/api";
import { Exercise, WorkoutDay, WorkoutPlan, WorkoutSession } from "../types/workout";

// Mock data for development - replace with actual API calls
export const mockExercises: Exercise[] = [
  {
    id: '1',
    exercise_id: 'pushups_001',
    name: 'Push-ups',
    category: 'Chest',
    type: 'Bodyweight',
    imageUrl: '/src/assets/images/pushups-exercise.svg',
    sets: 3,
    reps: 12,
    target: 'chest',
    equipment: 'body weight',
    bodyPart: 'chest'
  },
  {
    id: '2',
    exercise_id: 'squats_001',
    name: 'Squats',
    category: 'Legs',
    type: 'Bodyweight',
    imageUrl: '/src/assets/images/squats-exercise.svg',
    sets: 4,
    reps: 10,
    target: 'upper legs',
    equipment: 'body weight',
    bodyPart: 'upper legs'
  },
  {
    id: '3',
    exercise_id: 'lunges_001',
    name: 'Lunges',
    category: 'Legs',
    type: 'Bodyweight',
    imageUrl: '/src/assets/images/lunges-exercise.svg',
    sets: 3,
    reps: 15,
    target: 'upper legs',
    equipment: 'body weight',
    bodyPart: 'upper legs'
  }
];

export const mockWorkoutPlan: WorkoutPlan = {
  id: '1',
  name: 'July 2024 Workout Plan',
  type: 'weekly',
  startDate: '2024-07-01',
  endDate: '2024-07-31',
  days: [
    {
      date: '2024-07-01',
      dayOfWeek: 'MON',
      weekday: 0, // Monday = 0
      exercises: [mockExercises[0]],
      isCompleted: true,
      isToday: false,
      isSelected: false
    },
    {
      date: '2024-07-02',
      dayOfWeek: 'TUE',
      weekday: 1, // Tuesday = 1
      exercises: [mockExercises[1]],
      isCompleted: true,
      isToday: false,
      isSelected: false
    },
    {
      date: '2024-07-03',
      dayOfWeek: 'WED',
      weekday: 2, // Wednesday = 2
      exercises: [mockExercises[2]],
      isCompleted: false,
      isToday: false,
      isSelected: false
    },
    {
      date: '2024-07-04',
      dayOfWeek: 'THU',
      weekday: 3, // Thursday = 3
      exercises: [mockExercises[0], mockExercises[1]],
      isCompleted: false,
      isToday: true,
      isSelected: true
    }
  ]
};

export const mockTodaysWorkout: WorkoutSession = {
  id: '1',
  date: '2024-07-04',
  exercises: [
    { ...mockExercises[0], sets: 3, reps: 12 },
    { ...mockExercises[1], sets: 4, reps: 10 }
  ],
  duration: 45,
  caloriesBurned: 320,
  isCompleted: false
};

const headers = () => {
  const accessToken = localStorage.getItem("access_token");
  if (!accessToken) throw new Error("User not authenticated");
  return { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` };
};

// External exercise database API base
const EXTERNAL_API_BASE = "https://workout-databaese.vercel.app/api/v1";

export const WorkoutService = {
  // ===== EXTERNAL EXERCISE DATABASE METHODS =====
  
  /**
   * Get all exercises with optional pagination & search
   */
  getExercises: async (
    offset: number = 0,
    limit: number = 20,
    search: string = ""
  ) => {
    const url = new URL(`${EXTERNAL_API_BASE}/exercises`);
    url.searchParams.append("offset", offset.toString());
    url.searchParams.append("limit", limit.toString());
    if (search) url.searchParams.append("search", search);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error("Failed to fetch exercises");
    return resp.json();
  },

  /**
   * Fuzzy search exercises
   */
  searchExercises: async (
    query: string,
    offset: number = 0,
    limit: number = 10,
    threshold: number = 0.3
  ) => {
    const url = new URL(`${EXTERNAL_API_BASE}/exercises/search`);
    url.searchParams.append("q", query);
    url.searchParams.append("offset", offset.toString());
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("threshold", threshold.toString());

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error("Failed to search exercises");
    return resp.json();
  },

  /**
   * Smart search that normalizes API responses and gracefully falls back.
   * - Tries /exercises/search first (fuzzy)
   * - Falls back to /exercises?search= when needed
   * Always returns an array of items
   */
  searchExercisesSmart: async (
    query: string,
    limit: number = 5,
    threshold: number = 0.6
  ): Promise<any[]> => {
    try {
      const primary = await WorkoutService.searchExercises(query, 0, limit, threshold);
      if (Array.isArray(primary)) return primary;
      // Some APIs wrap results
      const fromWrapped = (primary && (primary.items || primary.data || primary.results)) || [];
      if (Array.isArray(fromWrapped)) return fromWrapped;
    } catch (e) {
      // ignore and try fallback
    }

    try {
      // fallback to basic search endpoint
      const list = await WorkoutService.getExercises(0, limit, query);
      if (Array.isArray(list)) return list;
      const fromWrapped = (list && (list.items || list.data || list.results)) || [];
      if (Array.isArray(fromWrapped)) return fromWrapped;
    } catch (e) {
      // ignore
    }

    return [];
  },

  /**
   * Advanced filter by muscle, equipment, body part
   */
  filterExercises: async (filters: {
    search?: string;
    muscles?: string[];
    equipment?: string[];
    bodyParts?: string[];
    offset?: number;
    limit?: number;
  }) => {
    const url = new URL(`${EXTERNAL_API_BASE}/exercises/filter`);
    if (filters.search) url.searchParams.append("search", filters.search);
    if (filters.muscles) url.searchParams.append("muscles", filters.muscles.join(","));
    if (filters.equipment) url.searchParams.append("equipment", filters.equipment.join(","));
    if (filters.bodyParts) url.searchParams.append("bodyParts", filters.bodyParts.join(","));
    url.searchParams.append("offset", String(filters.offset || 0));
    url.searchParams.append("limit", String(filters.limit || 10));

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error("Failed to filter exercises");
    return resp.json();
  },

  /**
   * Get single exercise by ID
   */
  getExerciseById: async (exerciseId: string) => {
    const resp = await fetch(`${EXTERNAL_API_BASE}/exercises/${exerciseId}`);
    if (!resp.ok) throw new Error("Exercise not found");
    return resp.json();
  },

  /**
   * Get exercises by body part
   */
  getExercisesByBodyPart: async (bodyPart: string, limit: number = 10) => {
    const resp = await fetch(
      `${EXTERNAL_API_BASE}/bodyparts/${encodeURIComponent(bodyPart)}/exercises?limit=${limit}`
    );
    if (!resp.ok) throw new Error("Failed to fetch exercises by body part");
    return resp.json();
  },

  /**
   * Get exercises by equipment
   */
  getExercisesByEquipment: async (equipment: string, limit: number = 10) => {
    const resp = await fetch(
      `${EXTERNAL_API_BASE}/equipments/${encodeURIComponent(equipment)}/exercises?limit=${limit}`
    );
    if (!resp.ok) throw new Error("Failed to fetch exercises by equipment");
    return resp.json();
  },

  /**
   * Get exercises by muscle
   */
  getExercisesByMuscle: async (
    muscle: string,
    includeSecondary: boolean = false,
    limit: number = 10
  ) => {
    const url = new URL(`${EXTERNAL_API_BASE}/muscles/${encodeURIComponent(muscle)}/exercises`);
    url.searchParams.append("includeSecondary", includeSecondary.toString());
    url.searchParams.append("limit", limit.toString());

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error("Failed to fetch exercises by muscle");
    return resp.json();
  },

  /**
   * Get all body parts
   */
  getBodyParts: async () => {
    const resp = await fetch(`${EXTERNAL_API_BASE}/bodyparts`);
    if (!resp.ok) throw new Error("Failed to fetch body parts");
    return resp.json();
  },

  /**
   * Get all muscles
   */
  getMuscles: async () => {
    const resp = await fetch(`${EXTERNAL_API_BASE}/muscles`);
    if (!resp.ok) throw new Error("Failed to fetch muscles");
    return resp.json();
  },

  /**
   * Get all equipment
   */
  getEquipments: async () => {
    const resp = await fetch(`${EXTERNAL_API_BASE}/equipments`);
    if (!resp.ok) throw new Error("Failed to fetch equipment");
    return resp.json();
  },

  // ===== LOCAL WORKOUT MANAGEMENT METHODS =====

  /**
   * Search exercises using local backend (fallback)
   */
  async searchExercisesLocal(params: {
    q?: string; bodyPart?: string; target?: string; equipment?: string; page?: number; limit?: number;
  }) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) usp.set(k, String(v)); });
    const resp = await fetch(`${API_ENDPOINTS.EXERCISES}?${usp.toString()}`);
    const json = await resp.json();
    return (json.items || []) as Exercise[];
  },

  /**
   * Get workout plan from local backend
   */
  // Simple in-memory cache to reduce latency for rapid navigations
  __cache: new Map<string, { t: number; v: any }>(),
  __getCached(key: string, maxAgeMs: number) {
    const e = (this.__cache as Map<string, { t: number; v: any }>).get(key);
    if (!e) return null;
    if (Date.now() - e.t > maxAgeMs) return null;
    return e.v;
  },
  __setCached(key: string, v: any) {
    (this.__cache as Map<string, { t: number; v: any }>).set(key, { t: Date.now(), v });
  },
  async getWorkoutPlan(): Promise<WorkoutPlan> {
    const cached = (this as any).__getCached('workout_plan', 10_000);
    if (cached) return cached as WorkoutPlan;
    const controller = new AbortController();
    const resp = await fetch(API_ENDPOINTS.WORKOUT.PLAN, { headers: headers(), signal: controller.signal });
    const json = await resp.json();
    (this as any).__setCached('workout_plan', json);
    return json;
  },

  /**
   * Add exercise to a specific workout day
   */
  async addExerciseToDay(weekday: number, exercise: Exercise) {
    const payload = {
      exercise_id: exercise.exercise_id || exercise.id, // Use exercise_id if available, fallback to id
      name: exercise.name,
      gifUrl: exercise.gifUrl,
      target: exercise.target,
      equipment: exercise.equipment,
      bodyPart: exercise.bodyPart,
      sets: exercise.sets || 3,
      reps: exercise.reps || 10
    };
    const resp = await fetch(API_ENDPOINTS.WORKOUT.ADD_TO_DAY(weekday), {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(payload)
    });
    return resp.ok;
  },

  /**
   * Get today's workout session
   */
  async getTodaysSession(): Promise<WorkoutSession> {
    const cached = (this as any).__getCached('workout_session_today', 5_000);
    if (cached) return cached as WorkoutSession;
    const controller = new AbortController();
    const resp = await fetch(API_ENDPOINTS.WORKOUT.SESSION_TODAY, { headers: headers(), signal: controller.signal });
    const json = await resp.json();
    (this as any).__setCached('workout_session_today', json);
    return json;
  },

  /**
   * Mark an exercise as completed
   */
  async completeExercise(exerciseId: string) {
    const resp = await fetch(API_ENDPOINTS.WORKOUT.COMPLETE_EX(exerciseId), {
      method: "PATCH",
      headers: headers(),
    });
    return resp.ok;
  },

  /**
   * Check conflicts for a set of dates for custom plan entries
   */
  async checkCustomPlanConflicts(dates: string[]): Promise<{ conflicts: { date: string; plan_type: string }[] }> {
    const resp = await fetch(API_ENDPOINTS.WORKOUT.CUSTOM_CHECK_CONFLICTS, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ dates })
    });
    if (!resp.ok) throw new Error('Failed to check plan conflicts');
    return resp.json();
  },

  /**
   * Save custom plan entries per date, with optional replacement
   */
  async saveCustomPlan(entries: { date: string; workout_details: any }[], replace: boolean): Promise<{ ok: boolean; replaced: boolean; dates: string[] }>{
    const resp = await fetch(API_ENDPOINTS.WORKOUT.CUSTOM_SAVE, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ entries, replace })
    });
    if (!resp.ok) throw new Error('Failed to save custom plan');
    return resp.json();
  },
};
