export interface OnboardingStep1Data {
  gender: string;
  dateOfBirth: string;
  weight: string;
  height: string;
  profilePicture: File | null;
  profilePictureUrl?: string; // For existing data from backend
}

export interface OnboardingStep2Data {
  activityLevel: string;
  medicalConditions: string[];
  fitnessGoals: string[];
  timeAvailable: string;
  preferredWorkoutType: string;
  otherMedicalCondition?: string;
  customGoal?: string;
}

export interface OnboardingNutritionData {
  dietType: string;
  allergies: string[];
  dislikedFoods: string;
  favoriteCuisines: string[];
  mealsPerDay: number | null;
  snacksPerDay: number | null;
  cookingTimePreference: string | null;
}

// Backend API types
export interface OnboardingStep1API {
  gender?: string;
  date_of_birth?: string;
  weight?: string;
  height?: string;
  profile_picture_url?: string;
}

export interface OnboardingStep2API {
  activity_level?: string;
  medical_conditions?: string[];
  fitness_goals?: string[];
  time_available?: string;
  preferred_workout_type?: string;
  other_medical_condition?: string;
  custom_goal?: string;
}

export interface OnboardingUpdateRequest {
  step1?: OnboardingStep1API;
  step2?: OnboardingStep2API;
  nutrition?: {
    diet_type?: string;
    allergies?: string[];
    disliked_foods?: string;
    favorite_cuisines?: string[];
    meals_per_day?: number | null;
    snacks_per_day?: number | null;
    cooking_time_preference?: string | null;
  };
  complete?: boolean;
}

export interface OnboardingStep3Data {
  // Step 3 is a review step, so it doesn't have its own form data
  // It displays a summary of steps 1 and 2
}

export interface OnboardingData {
  step1: OnboardingStep1Data;
  step2: OnboardingStep2Data;
  nutrition?: OnboardingNutritionData;
  step3?: OnboardingStep3Data;
  currentStep: number;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  step1: {
    gender: '',
    dateOfBirth: '',
    weight: '',
    height: '',
    profilePicture: null,
  },
  step2: {
    activityLevel: '',
    medicalConditions: [],
    fitnessGoals: [],
    timeAvailable: '',
    preferredWorkoutType: '',
    otherMedicalCondition: '',
    customGoal: '',
  },
  nutrition: {
    dietType: 'Balanced',
    allergies: [],
    dislikedFoods: '',
    favoriteCuisines: [],
    mealsPerDay: null,
    snacksPerDay: null,
    cookingTimePreference: null,
  },
  currentStep: 1,
};

// AI Assessment Types
export interface AIAssessmentRequest {
  gender: string;
  date_of_birth: string;
  weight: string;
  height: string;
  activity_level: string;
  medical_conditions: string[];
  fitness_goals: string[];
  time_available: string;
  preferred_workout_type: string;
  other_medical_condition?: string;
  custom_goal?: string;
}

export interface AIAssessmentResponse {
  time_to_goal: string;
  motivational_message: string;
  health_score: number;
  risk_profile: string[];
  predicted_calories: number;  // AI-predicted daily calorie needs
}

export interface GoalFeasibilityRequest {
  gender: string;
  date_of_birth: string;
  weight: number;
  height: string;  // Can be feet'inches" format or cm as string
  activity_level: string;
  medical_conditions: string[];
  selected_goal: string;
  custom_goal?: string;
}

export interface GoalFeasibilityResponse {
  feasible: boolean;
  reason: string;
  recommended_goal: string;
  custom_goal?: string; // Store custom goal text to prevent duplicate API calls
}
