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
}
