import { API_ENDPOINTS } from '../config/api';

const authHeaders = () => {
  const accessToken = localStorage.getItem("access_token");
  if (!accessToken) throw new Error("User not authenticated");
  return { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` };
};

export interface ProgressNutritionData {
  calories?: {
    consumed: number;
    recommended: number;
    dailyData: Array<{ date: string; calories: number }>;
  };
  macros?: {
    protein: { consumed: number; target: number; color: string };
    carbs: { consumed: number; target: number; color: string };
    fats: { consumed: number; target: number; color: string };
    dailyData: Array<{ date: string; protein: number; carbs: number; fats: number }>;
  };
  mealCompliance?: {
    rate: number;
    totalMeals: number;
    compliantMeals: number;
    dailyData: Array<{
      date: string;
      meals: Array<{
        name: string;
        planned: boolean;
        followed: boolean;
        time: string;
      }>;
    }>;
  };
}

export const ProgressService = {
  async getNutritionData(): Promise<ProgressNutritionData> {
    try {
      const [caloriesRes, macrosRes, mealsRes] = await Promise.all([
        fetch(API_ENDPOINTS.PROGRESS.CALORIES, { headers: authHeaders() }),
        fetch(API_ENDPOINTS.PROGRESS.MACROS, { headers: authHeaders() }),
        fetch(API_ENDPOINTS.PROGRESS.MEALS, { headers: authHeaders() }),
      ]);

      const caloriesData = caloriesRes.ok ? await caloriesRes.json() : null;
      const macrosData = macrosRes.ok ? await macrosRes.json() : null;
      const mealsData = mealsRes.ok ? await mealsRes.json() : null;

      return {
        calories: caloriesData,
        macros: macrosData,
        mealCompliance: mealsData,
      };
    } catch (error) {
      console.error('Failed to fetch nutrition progress data:', error);
      return {};
    }
  },

  // Force refresh all progress data (for when meals are logged)
  async refreshProgressData(): Promise<void> {
    // This is a placeholder - in a real implementation, you might want to
    // emit an event or use a global state management solution to refresh
    // all progress-related components
    console.log('Progress data refresh requested');

    // In a more sophisticated implementation, you could emit events or use
    // a state management solution to refresh progress components
    // For now, we'll dispatch a custom event that other components can listen to
    window.dispatchEvent(new CustomEvent('progress-data-refresh'));
  },

  // Refresh nutrition progress data specifically
  async refreshNutritionProgress(): Promise<ProgressNutritionData> {
    try {
      const [caloriesRes, macrosRes, mealsRes] = await Promise.all([
        fetch(API_ENDPOINTS.PROGRESS.CALORIES, { headers: authHeaders() }),
        fetch(API_ENDPOINTS.PROGRESS.MACROS, { headers: authHeaders() }),
        fetch(API_ENDPOINTS.PROGRESS.MEALS, { headers: authHeaders() }),
      ]);

      const caloriesData = caloriesRes.ok ? await caloriesRes.json() : null;
      const macrosData = macrosRes.ok ? await macrosRes.json() : null;
      const mealsData = mealsRes.ok ? await mealsRes.json() : null;

      const nutritionData = {
        calories: caloriesData,
        macros: macrosData,
        mealCompliance: mealsData,
      };

      // Dispatch event to notify components of updated nutrition data
      window.dispatchEvent(new CustomEvent('nutrition-progress-updated', { detail: nutritionData }));

      return nutritionData;
    } catch (error) {
      console.error('Failed to refresh nutrition progress data:', error);
      return {};
    }
  },
};
