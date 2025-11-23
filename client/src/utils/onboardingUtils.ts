import { OnboardingStep1Data, OnboardingStep2Data } from '../types/onboarding';

// Utility functions to format onboarding data for display

export const formatGender = (gender: string): string => {
  const genderMap: { [key: string]: string } = {
    'male': 'Male',
    'female': 'Female',
    'other': 'Other',
    'prefer-not-to-say': 'Prefer not to say'
  };
  return genderMap[gender] || gender;
};

export const formatActivityLevel = (level: string): string => {
  const levelMap: { [key: string]: string } = {
    'sedentary': 'Sedentary',
    'lightly-active': 'Lightly Active',
    'moderately-active': 'Moderately Active',
    'very-active': 'Very Active'
  };
  return levelMap[level] || level;
};

export const formatMedicalConditions = (conditions: string[]): string => {
  if (conditions.includes('none') || conditions.length === 0) {
    return 'None';
  }
  
  const conditionMap: { [key: string]: string } = {
    'diabetes': 'Diabetes',
    'heart-disease': 'Heart Disease',
    'asthma': 'Asthma',
    'high-blood-pressure': 'High Blood Pressure'
  };
  
  return conditions
    .filter(c => c !== 'none')
    .map(c => conditionMap[c] || c)
    .join(', ');
};

export const formatFitnessGoals = (goals: string[]): string[] => {
  const goalMap: { [key: string]: string } = {
    'weight-loss': 'Weight Loss',
    'muscle-gain': 'Muscle Gain',
    'improved-endurance': 'Improved Endurance',
    'overall-health': 'Overall Health'
  };
  
  return goals.map(g => goalMap[g] || g);
};

export const calculateAge = (dateOfBirth: string): number => {
  if (!dateOfBirth) return 0;
  
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

export const getPersonalInfoSummary = (step1Data: OnboardingStep1Data) => {
  return [
    { label: 'Name', value: 'User' }, // In real app, this would come from auth data
    { label: 'Age', value: calculateAge(step1Data.dateOfBirth).toString() },
    { label: 'Gender', value: formatGender(step1Data.gender) },
    { label: 'Weight', value: `${step1Data.weight} lbs` },
    { label: 'Height', value: step1Data.height }
  ];
};

export const getFitnessGoalsSummary = (step2Data: OnboardingStep2Data) => {
  const formattedGoals = formatFitnessGoals(step2Data.fitnessGoals);
  
  return [
    { label: 'Primary Goal', value: formattedGoals[0] || 'Not specified' },
    { label: 'Secondary Goal', value: formattedGoals[1] || 'Not specified' },
    { label: 'Activity Level', value: formatActivityLevel(step2Data.activityLevel) }
  ];
};

export const getPreferencesSummary = (step2Data: OnboardingStep2Data) => {
  const medicalConditions = formatMedicalConditions(step2Data.medicalConditions);
  
  return [
    { label: 'Medical Conditions', value: medicalConditions },
    { label: 'Fitness Goals', value: formatFitnessGoals(step2Data.fitnessGoals).join(', ') }
  ];
};
