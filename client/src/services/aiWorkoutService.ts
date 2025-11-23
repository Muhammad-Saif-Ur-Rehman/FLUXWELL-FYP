import { API_ENDPOINTS } from '../config/api';
import { 
  FilterLibraryResponse, 
  SuggestAlternativeResponse, 
  GeneratePlanResponse,
  ExerciseOut,
  PlanExercise
} from '../types/workout';

class AIWorkoutService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private getHeaders(): HeadersInit {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      throw new Error('User not authenticated');
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async filterLibrary(filters: any = {}, limit: number = 40, offset: number = 0): Promise<FilterLibraryResponse> {
    try {
      // Create cache key based on filters and limit
      const cacheKey = `filter_library_${JSON.stringify(filters)}_${limit}_${offset}`;
      
      // Check cache first
      const cachedData = this.getCachedData(cacheKey);
      if (cachedData) {
        console.log('Returning cached exercise data');
        return cachedData;
      }

      const response = await fetch(API_ENDPOINTS.AI.WORKOUT.FILTER_LIBRARY, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ filters, limit, offset }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the response
      this.setCachedData(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('Error filtering library:', error);
      throw new Error('Failed to filter exercise library');
    }
  }

  async suggestAlternative(skippedExercise: ExerciseOut | PlanExercise, reason: string, dayFocus?: string): Promise<SuggestAlternativeResponse> {
    try {
      // Convert PlanExercise to ExerciseOut format if needed
      const exerciseData = 'targetMuscles' in skippedExercise ? skippedExercise : {
        exerciseId: skippedExercise.exerciseId,
        name: skippedExercise.name,
        gifUrl: skippedExercise.gifUrl,
        targetMuscles: [],
        bodyParts: [],
        equipments: [],
        secondaryMuscles: [],
        instructions: []
      };

      // Add context information to help with better suggestions
      // If we don't have detailed exercise info, try to infer from name and day focus
      let muscles = exerciseData.targetMuscles || [];
      let body_parts = exerciseData.bodyParts || [];
      let equipment = exerciseData.equipments || [];
      
      // If we don't have context, try to infer from exercise name and day focus
      if (muscles.length === 0 && body_parts.length === 0) {
        const name = exerciseData.name.toLowerCase();
        const focus = (dayFocus || '').toLowerCase();
        
        // First, try to infer from day focus if available
        if (focus.includes('upper body') || focus.includes('push') || focus.includes('pull')) {
          if (focus.includes('push')) {
            muscles = ['chest', 'triceps', 'shoulders'];
            body_parts = ['chest', 'upper arms', 'shoulders'];
          } else if (focus.includes('pull')) {
            muscles = ['back', 'biceps', 'lats'];
            body_parts = ['back', 'upper arms'];
          } else {
            muscles = ['chest', 'back', 'shoulders', 'arms'];
            body_parts = ['chest', 'back', 'upper arms', 'shoulders'];
          }
        } else if (focus.includes('lower body')) {
          muscles = ['legs', 'glutes', 'quads', 'hamstrings', 'calves'];
          body_parts = ['upper legs', 'lower legs'];
        } else if (focus.includes('full body')) {
          muscles = ['full body', 'core'];
          body_parts = ['full body', 'waist'];
        } else {
          // Fallback to inferring from exercise name
          if (name.includes('chest') || name.includes('bench') || name.includes('press')) {
            muscles = ['chest', 'triceps', 'shoulders'];
            body_parts = ['chest', 'upper arms'];
          } else if (name.includes('back') || name.includes('row') || name.includes('pull')) {
            muscles = ['back', 'biceps', 'lats'];
            body_parts = ['back', 'upper arms'];
          } else if (name.includes('squat') || name.includes('leg') || name.includes('glute')) {
            muscles = ['legs', 'glutes', 'quads', 'hamstrings'];
            body_parts = ['upper legs', 'lower legs'];
          } else if (name.includes('shoulder') || name.includes('deltoid')) {
            muscles = ['shoulders', 'deltoids'];
            body_parts = ['shoulders', 'upper arms'];
          } else if (name.includes('bicep') || name.includes('curl')) {
            muscles = ['biceps'];
            body_parts = ['upper arms'];
          } else if (name.includes('tricep') || name.includes('extension')) {
            muscles = ['triceps'];
            body_parts = ['upper arms'];
          } else if (name.includes('core') || name.includes('abs') || name.includes('plank')) {
            muscles = ['core', 'abs'];
            body_parts = ['waist'];
          } else {
            // Default to full body if we can't determine
            muscles = ['full body'];
            body_parts = ['full body'];
          }
        }
        
        // Infer equipment from exercise name
        if (name.includes('dumbbell') || name.includes('db ')) {
          equipment = ['dumbbell'];
        } else if (name.includes('barbell') || name.includes('bb ')) {
          equipment = ['barbell'];
        } else if (name.includes('cable') || name.includes('machine')) {
          equipment = ['cable'];
        } else if (name.includes('kettlebell') || name.includes('kb ')) {
          equipment = ['kettlebell'];
        } else if (name.includes('bodyweight') || name.includes('body weight') || name.includes('no equipment')) {
          equipment = ['body weight'];
        } else {
          equipment = ['body weight']; // Default to bodyweight
        }
      }
      
      const context = {
        muscles,
        body_parts,
        equipment
      };

      const response = await fetch(API_ENDPOINTS.AI.WORKOUT.SUGGEST_ALTERNATIVE, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ 
          skipped_exercise: exerciseData, 
          reason,
          context 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error suggesting alternative:', error);
      throw new Error('Failed to get exercise alternatives');
    }
  }

  async generatePlan(overrides: any = {}): Promise<GeneratePlanResponse> {
    try {
      const response = await fetch(API_ENDPOINTS.AI.WORKOUT.GENERATE_PLAN, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(overrides),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating plan:', error);
      throw new Error('Failed to generate AI workout plan');
    }
  }

  /**
   * Persist AI mode flag on the server so it survives reloads
   */
  async setAIMode(mode: 'ai' | 'assist'): Promise<void> {
    try {
      const response = await fetch(`${API_ENDPOINTS.AI.WORKOUT.GENERATE_PLAN.replace('/generate-plan', '/generate')}?mode=${mode}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      // Endpoint returns agent payload; we don't need it here
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error setting AI mode:', error);
      // Non-fatal for UI, but log it
    }
  }
}

export const aiWorkoutService = new AIWorkoutService();
