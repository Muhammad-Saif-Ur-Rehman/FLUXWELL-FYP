// Dashboard Service - Fetches all dashboard data
import { API_ENDPOINTS } from '../config/api';

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('access_token');
  if (!token) return {};
  return { 'Authorization': `Bearer ${token}` };
};

export interface DashboardMetrics {
  workout_completion: {
    completion_rate: number;
    workouts_this_week: number;
    avg_duration: number;
  };
  calorie_intake: {
    consumed: number;
    recommended: number;
    deficit: number;
  };
  macro_breakdown: {
    protein: number;
    carbs: number;
    fats: number;
  };
  meal_compliance: {
    compliance_rate: number;
    meals_this_week: number;
  };
  activity_trends: {
    steps_today: number;
    steps_weekly_avg: number;
    calories_burned: number;
    active_minutes: number;
  };
  goal_achievement: {
    achievement_rate: number;
    completed_goals: number;
    total_goals: number;
  };
  sleep_recovery: {
    avg_duration: number;
    avg_recovery_score: number;
    entries_this_week: number;
  };
  hydration_trends: {
    avg_consumed: number;
    target: number;
    compliance_rate: number;
  };
  badges_streaks: {
    total_badges: number;
    current_streak: number;
    longest_streak: number;
  };
}

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_updated: string;
}

export interface MacrosToday {
  protein_consumed: number;
  carbs_consumed: number;
  fats_consumed: number;
  protein_target: number;
  carbs_target: number;
  fats_target: number;
  last_meal?: {
    name: string;
    calories: number;
    logged_at: string;
  };
}

export interface RealtimeData {
  steps: number;
  sleep_hours: number;
  heart_rate: number;
  calories_burned: number;
  last_sync: string;
  data_source: string; // 'google_fit' or 'fitbit' or 'none'
}

export interface WorkoutSummary {
  workouts_completed_this_week: number;
  workouts_total_this_week: number;
  completion_days: number[]; // Array of day indices that had completed workouts
  next_workout?: {
    name: string;
    scheduled_for: string;
  };
}

class DashboardService {
  /**
   * Fetch comprehensive dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const response = await fetch(API_ENDPOINTS.PROGRESS.DASHBOARD, {
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        console.error('Failed to fetch dashboard metrics:', response.statusText);
        return this.getFallbackMetrics();
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      return this.getFallbackMetrics();
    }
  }

  /**
   * Fetch streak data
   */
  async getStreak(): Promise<StreakData> {
    try {
      const response = await fetch(API_ENDPOINTS.NUTRITION.STREAK, {
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        console.error('Failed to fetch streak:', response.statusText);
        return { current_streak: 0, longest_streak: 0, last_updated: new Date().toISOString() };
      }
      
      const data = await response.json();
      return {
        current_streak: data.current_streak || 0,
        longest_streak: data.longest_streak || 0,
        last_updated: data.last_activity_date || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error fetching streak:', error);
      return { current_streak: 0, longest_streak: 0, last_updated: new Date().toISOString() };
    }
  }

  /**
   * Fetch today's macros from nutrition module
   */
  async getMacrosToday(): Promise<MacrosToday> {
    try {
      // Get macro targets first
      const macrosResponse = await fetch(API_ENDPOINTS.NUTRITION.MACROS, {
        headers: authHeaders(),
      });
      
      if (!macrosResponse.ok) {
        console.error('Failed to fetch macro targets:', macrosResponse.statusText);
        return this.getFallbackMacros();
      }
      
      const macroTargets = await macrosResponse.json();
      
      // Get today's meals to calculate consumed macros
      const today = new Date().toISOString().split('T')[0];
      const mealsResponse = await fetch(`${API_ENDPOINTS.NUTRITION.MEALS}?start=${today}&end=${today}`, {
        headers: authHeaders(),
      });
      
      let consumed = { protein: 0, carbs: 0, fats: 0, calories: 0 };
      let lastMeal: { name: string; calories: number; logged_at: string } | undefined = undefined;
      
      if (mealsResponse.ok) {
        const meals = await mealsResponse.json();
        
        // Calculate total consumed macros from meals
        for (const meal of meals) {
          for (const item of meal.items || []) {
            consumed.protein += item.protein_g || 0;
            consumed.carbs += item.carbs_g || 0;
            consumed.fats += item.fats_g || 0;
            consumed.calories += item.calories || 0;
          }
        }
        
        // Get last meal
        if (meals.length > 0) {
          const lastMealData = meals[meals.length - 1];
          const mealName = lastMealData.items?.[0]?.name || lastMealData.notes || lastMealData.meal_type || 'Meal';
          lastMeal = {
            name: mealName,
            calories: Math.round(lastMealData.items?.reduce((sum: number, item: any) => sum + (item.calories || 0), 0) || 0),
            logged_at: lastMealData.timestamp || new Date().toISOString(),
          };
        }
      }
      
      return {
        protein_consumed: consumed.protein,
        carbs_consumed: consumed.carbs,
        fats_consumed: consumed.fats,
        protein_target: macroTargets?.protein_g || 150,
        carbs_target: macroTargets?.carbs_g || 250,
        fats_target: macroTargets?.fats_g || 67,
        last_meal: lastMeal,
      };
    } catch (error) {
      console.error('Error fetching macros:', error);
      return this.getFallbackMacros();
    }
  }

  /**
   * Fetch realtime tracking data
   */
  async getRealtimeData(): Promise<RealtimeData> {
    try {
      const response = await fetch((API_ENDPOINTS as any).REALTIME.METRICS, {
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        console.warn('Failed to fetch realtime data:', response.statusText);
        return this.getFallbackRealtimeData();
      }
      
      const data = await response.json();
      
      // Parse sleep data (could be "light", "deep", "rem" or hours)
      let sleep_hours = 0;
      if (data.sleep) {
        if (typeof data.sleep === 'number') {
          sleep_hours = data.sleep;
        } else if (typeof data.sleep === 'string') {
          // Extract hours from sleep data if available
          sleep_hours = 0; // Fallback for categorical sleep data
        }
      }
      
      return {
        steps: data.steps || 0,
        sleep_hours: sleep_hours,
        heart_rate: data.heart_rate || 0,
        calories_burned: data.calories || 0,
        last_sync: data.last_sync || new Date().toISOString(),
        data_source: 'google_fit', // Will be determined by backend
      };
    } catch (error) {
      console.error('Error fetching realtime data:', error);
      return this.getFallbackRealtimeData();
    }
  }

  /**
   * Fetch workout summary for the week
   */
  async getWorkoutSummary(): Promise<WorkoutSummary> {
    try {
      const response = await fetch(API_ENDPOINTS.PROGRESS.WORKOUT_COMPLETION, {
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        console.error('Failed to fetch workout summary:', response.statusText);
        return this.getFallbackWorkoutSummary();
      }
      
      const data = await response.json();
      
      return {
        workouts_completed_this_week: data.workouts_completed || 0,
        workouts_total_this_week: data.workouts_total || 0,
        completion_days: data.completion_days || [],
        next_workout: data.next_workout,
      };
    } catch (error) {
      console.error('Error fetching workout summary:', error);
      return this.getFallbackWorkoutSummary();
    }
  }

  /**
   * Fetch all dashboard data in parallel for performance
   */
  async getAllDashboardData() {
    const [metrics, streak, macros, realtime, workout] = await Promise.all([
      this.getDashboardMetrics(),
      this.getStreak(),
      this.getMacrosToday(),
      this.getRealtimeData(),
      this.getWorkoutSummary(),
    ]);

    return {
      metrics,
      streak,
      macros,
      realtime,
      workout,
    };
  }

  // Fallback data for when API calls fail
  private getFallbackMetrics(): DashboardMetrics {
    return {
      workout_completion: {
        completion_rate: 0,
        workouts_this_week: 0,
        avg_duration: 0,
      },
      calorie_intake: {
        consumed: 0,
        recommended: 0,
        deficit: 0,
      },
      macro_breakdown: {
        protein: 0,
        carbs: 0,
        fats: 0,
      },
      meal_compliance: {
        compliance_rate: 0,
        meals_this_week: 0,
      },
      activity_trends: {
        steps_today: 0,
        steps_weekly_avg: 0,
        calories_burned: 0,
        active_minutes: 0,
      },
      goal_achievement: {
        achievement_rate: 0,
        completed_goals: 0,
        total_goals: 0,
      },
      sleep_recovery: {
        avg_duration: 0,
        avg_recovery_score: 0,
        entries_this_week: 0,
      },
      hydration_trends: {
        avg_consumed: 0,
        target: 0,
        compliance_rate: 0,
      },
      badges_streaks: {
        total_badges: 0,
        current_streak: 0,
        longest_streak: 0,
      },
    };
  }

  private getFallbackMacros(): MacrosToday {
    return {
      protein_consumed: 0,
      carbs_consumed: 0,
      fats_consumed: 0,
      protein_target: 0,
      carbs_target: 0,
      fats_target: 0,
    };
  }

  private getFallbackRealtimeData(): RealtimeData {
    return {
      steps: 0,
      sleep_hours: 0,
      heart_rate: 0,
      calories_burned: 0,
      last_sync: new Date().toISOString(),
      data_source: 'none',
    };
  }

  private getFallbackWorkoutSummary(): WorkoutSummary {
    return {
      workouts_completed_this_week: 0,
      workouts_total_this_week: 0,
      completion_days: [],
    };
  }
}

export const dashboardService = new DashboardService();

