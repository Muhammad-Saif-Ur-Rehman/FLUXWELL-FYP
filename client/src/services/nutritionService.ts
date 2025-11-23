import { API_ENDPOINTS } from "../config/api";

const authHeaders = () => {
  const accessToken = localStorage.getItem("access_token");
  if (!accessToken) throw new Error("User not authenticated");
  return { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` };
};

export type FoodItem = {
  name: string;
  serving_size?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  notes?: string;
  image_url?: string;
};

export type MealLog = {
  id: string;
  meal_type: string;
  timestamp: string;
  items: FoodItem[];
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type MacroTargets = {
  id: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  diet_pref?: string;
  exclude_foods?: string[];
  updated_at: string;
};

export type AgentPlan = {
  meal_type?: string;
  title?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  ingredients?: string[];
  steps?: string[];
};

export type AgentPlanResponse = {
  plan: AgentPlan[];
  snacks: AgentPlan[];
  suggestions?: string[];
  water_goal_ml?: number;
  plan_macros?: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  };
  grocery_list?: string[];
  // Present in some responses like auto-generate when using cached plan
  cached?: boolean;
};

export type RefreshAgentPlanResponse = AgentPlanResponse & {
  cached: boolean;
  saved?: boolean;
};

export type MealSwapResponse = {
  alternatives?: Array<{ title?: string } | string>;
  swaps?: Record<string, any[]>;
  plan?: AgentPlan[];
  snacks?: AgentPlan[];
  message?: string;
  saved?: boolean;
  plan_macros?: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  };
  grocery_list?: string[];
  water_goal_ml?: number;
};

export const NutritionService = {
  async listMeals(params?: { start?: string; end?: string }): Promise<MealLog[]> {
    const usp = new URLSearchParams();
    if (params?.start) usp.set("start", params.start);
    if (params?.end) usp.set("end", params.end);
    const resp = await fetch(`${API_ENDPOINTS.NUTRITION.MEALS}${usp.toString() ? `?${usp}` : ''}`, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to fetch meals");
    return resp.json();
  },

  async createMeal(payload: { meal_type: string; timestamp?: string; items: FoodItem[]; notes?: string }): Promise<MealLog> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MEALS, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to create meal");
    return resp.json();
  },

  async updateMeal(mealId: string, payload: { meal_type: string; timestamp?: string; items: FoodItem[]; notes?: string }): Promise<MealLog> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MEAL(mealId), { method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to update meal");
    return resp.json();
  },

  async deleteMeal(mealId: string): Promise<boolean> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MEAL(mealId), { method: 'DELETE', headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to delete meal");
    return true;
  },

  async getMacros(): Promise<MacroTargets | null> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MACROS, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to fetch macro targets");
    return resp.json();
  },

  async setMacros(payload: Partial<Omit<MacroTargets, 'id' | 'updated_at'>>): Promise<MacroTargets> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MACROS, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to save macro targets");
    return resp.json();
  },

  async waterToday(): Promise<{ total_ml: number; goal_ml: number; logs: { id: string; amount_ml: number; timestamp: string }[] }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.WATER_TODAY, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to fetch today's water");
    return resp.json();
  },

  async addWater(amount_ml: number): Promise<{ id: string; amount_ml: number; timestamp: string; user_id: string; created_at: string }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.WATER_ADD, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ amount_ml }) });
    if (!resp.ok) throw new Error("Failed to add water");
    return resp.json();
  },

  async groceryList(): Promise<{ items: string[]; generated_at: string }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.GROCERY_LIST, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to fetch grocery list");
    return resp.json();
  },

  async groceryExport(): Promise<Blob> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.GROCERY_EXPORT, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to export grocery list");
    return resp.blob();
  },

  async mealSwap(payload: { meal_id?: string; reason?: string; desired_profile?: Record<string, any>; meal_type?: string; current_meal_title?: string; alternatives_count?: number; swap_in_title?: string; swap_in_meal?: any; slot_index?: number; is_snack?: boolean }): Promise<MealSwapResponse> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.MEAL_SWAP, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to fetch meal swap suggestions");
    return resp.json();
  },

  async generateRecipe(payload: { target_calories?: number; protein_g?: number; carbs_g?: number; fats_g?: number; diet_pref?: string; title_hint?: string }) {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.GENERATE_RECIPE, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to generate recipe");
    return resp.json();
  },

  async complianceToday(): Promise<{ status: string; score: number; meals_count: number; total_calories: number; target_calories?: number }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.COMPLIANCE_TODAY, { headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to fetch compliance");
    return resp.json();
  },

  async runAgent(): Promise<{ status: string }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_RUN, { method: 'POST', headers: authHeaders() });
    if (!resp.ok) throw new Error("Failed to queue nutrition agent");
    return resp.json();
  },

  async generateAgentPlan(): Promise<AgentPlanResponse> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_PLAN, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!resp.ok) throw new Error("Failed to generate nutrition plan");
    return resp.json();
  },

  async refreshAgentPlan(force = false): Promise<RefreshAgentPlanResponse> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_REFRESH, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ force }),
    });
    if (!resp.ok) throw new Error("Failed to refresh nutrition plan");
    return resp.json();
  },

  async autoGenerateMealPlan(): Promise<AgentPlanResponse> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_AUTO_GENERATE, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!resp.ok) throw new Error("Failed to auto-generate meal plan");
    return resp.json();
  },

  async saveAgentPlan(payload: { plan: AgentPlan[]; snacks: AgentPlan[]; water_goal_ml?: number; grocery_list?: string[]; suggestions?: string[]; plan_macros?: any }): Promise<{ success: boolean; plan?: AgentPlan[]; snacks?: AgentPlan[]; water_goal_ml?: number; grocery_list?: string[]; plan_macros?: any; saved?: boolean }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_SAVE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("Failed to save meal plan");
    return resp.json();
  },

  async swapWithAgent(payload: { meal_id?: string; reason?: string; desired_profile?: Record<string, any>; meal_type?: string; current_meal_title?: string; alternatives_count?: number; swap_in_title?: string }): Promise<AgentPlanResponse & { swaps: string[] }> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.AGENT_SWAP, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error("Failed to fetch agent swap suggestions");
    return resp.json();
  },

  async getProfile(): Promise<NutritionProfile | null> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.PROFILE, { headers: authHeaders() });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error("Failed to fetch nutrition profile");
    return resp.json();
  },

  async saveProfile(payload: NutritionProfilePayload): Promise<NutritionProfile> {
    const resp = await fetch(API_ENDPOINTS.NUTRITION.PROFILE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error("Failed to save nutrition profile");
    return resp.json();
  }
};

export type NutritionProfilePayload = {
  diet_type?: string | null;
  allergies?: string[];
  disliked_foods?: string | null;
  favorite_cuisines?: string[];
  meals_per_day?: number | null;
  snacks_per_day?: number | null;
  cooking_time_preference?: string | null;
};

export type NutritionProfile = NutritionProfilePayload & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};


