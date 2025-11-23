import React, { useState, useEffect } from 'react';
import { OnboardingStep1Data, OnboardingStep2Data, AIAssessmentRequest, AIAssessmentResponse } from '../../types/onboarding';
import { formatGender, formatActivityLevel, formatMedicalConditions, calculateAge } from '../../utils/onboardingUtils';
import { API_ENDPOINTS } from '../../config/api';
import logoIcon from '../../assets/images/movement-icon.svg';
import fitnessHeroBg from '../../assets/images/modern-gym-hero.jpg';

interface OnboardingStep3Props {
  step1Data: OnboardingStep1Data;
  step2Data: OnboardingStep2Data;
  onComplete: () => void;
  onBack: () => void;
  onEditStep1?: () => void;
  onEditStep2?: () => void;
}

const OnboardingStep3: React.FC<OnboardingStep3Props> = ({ 
  step1Data, 
  step2Data, 
  onComplete, 
  onBack,
  onEditStep1,
  onEditStep2
}) => {
  const [aiAssessment, setAiAssessment] = useState<AIAssessmentResponse | null>(null);
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(true);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // Function to save assessment to database
  const saveAssessmentToDatabase = async (assessment: AIAssessmentResponse) => {
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) return;

      const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_AI_ASSESSMENT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          time_to_goal: assessment.time_to_goal,
          motivational_message: assessment.motivational_message,
          health_score: assessment.health_score,
          risk_profile: assessment.risk_profile,
          predicted_calories: assessment.predicted_calories,  // Include AI-predicted calories
          generated_at: new Date().toISOString()
        }),
      });

      if (response.ok) {
        console.log('AI assessment saved to database successfully');
      } else {
        console.error('Failed to save AI assessment to database');
      }
    } catch (error) {
      console.error('Error saving AI assessment to database:', error);
    }
  };

  // Check for existing assessment first
  useEffect(() => {
    const checkExistingAssessment = async () => {
      try {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) return;

        const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ai_assessment) {
            // Use existing assessment
            setAiAssessment({
              time_to_goal: data.ai_assessment.time_to_goal,
              motivational_message: data.ai_assessment.motivational_message,
              health_score: data.ai_assessment.health_score,
              risk_profile: data.ai_assessment.risk_profile,
              predicted_calories: data.ai_assessment.predicted_calories || 2000  // Fallback to 2000 if missing
            });
            setIsLoadingAssessment(false);
            return true; // Found existing assessment
          }
        }
      } catch (error) {
        console.error('Error checking existing assessment:', error);
      }
      return false; // No existing assessment found
    };

    checkExistingAssessment().then(hasExisting => {
      if (!hasExisting) {
        // Only generate new assessment if no existing one found
        if (step1Data.gender && step1Data.dateOfBirth && step2Data.activityLevel) {
          const timer = setTimeout(() => {
            generateAssessment();
          }, 100);
          return () => clearTimeout(timer);
        } else {
          setIsLoadingAssessment(false);
        }
      }
    });
  }, []);

  // Generate AI assessment function
  const generateAssessment = async () => {
      try {
        setIsLoadingAssessment(true);
        setAssessmentError(null);

        const assessmentData: AIAssessmentRequest = {
          gender: step1Data.gender,
          date_of_birth: step1Data.dateOfBirth,
          weight: step1Data.weight,
          height: step1Data.height,
          activity_level: step2Data.activityLevel,
          medical_conditions: step2Data.medicalConditions,
          fitness_goals: step2Data.fitnessGoals,
          time_available: step2Data.timeAvailable,
          preferred_workout_type: step2Data.preferredWorkoutType,
          other_medical_condition: step2Data.otherMedicalCondition,
          custom_goal: step2Data.customGoal
        };

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch(API_ENDPOINTS.AI.ASSESSMENT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(assessmentData),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Assessment failed: ${response.status}`);
        }

        const assessment = await response.json();
        setAiAssessment(assessment);
        
        // Save assessment results to user collection
        await saveAssessmentToDatabase(assessment);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('AI Assessment timeout');
          setAssessmentError('Assessment is taking longer than expected. You can continue without it.');
        } else {
          console.error('AI Assessment error:', error);
          setAssessmentError('Unable to generate AI assessment. You can continue without it.');
        }
      } finally {
        setIsLoadingAssessment(false);
      }
    };

  // Format the data for display
  const formatHeight = (height: string) => {
    if (!height) return 'Not specified';
    return height;
  };

  const formatGoals = (goals: string[], customGoal?: string) => {
    if (!goals || goals.length === 0) return ['Not specified'];
    
    return goals.map(goal => {
      if (goal === 'custom' && customGoal) {
        return customGoal;
      }
      const goalMap: { [key: string]: string } = {
        'lose-weight': 'Lose Weight',
        'gain-muscle': 'Gain Muscle',
        'improve-endurance': 'Improve Endurance',
        'maintain-health': 'Maintain Health',
        'custom': 'Custom Goal'
      };
      return goalMap[goal] || goal;
    });
  };

  const formatMedicalConditionsForDisplay = (conditions: string[], otherCondition?: string) => {
    if (!conditions || conditions.length === 0 || conditions.includes('none')) {
      return 'None';
    }

    const conditionMap: { [key: string]: string } = {
      'back-problems': 'Back Problems',
      'knee-problems': 'Knee Problems', 
      'shoulder-problems': 'Shoulder Problems',
      'heart-condition': 'Heart Condition',
      'joint-pain': 'Joint Pain',
      'other': otherCondition || 'Other',
      'none': 'None'
    };

    return conditions
      .filter(c => c !== 'none')
      .map(c => {
        if (c === 'other' && otherCondition) {
          return otherCondition;
        }
        return conditionMap[c] || c;
      })
      .join(', ');
  };

  const formatWorkoutType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'gym': 'Gym',
      'home': 'Home',
      'outdoor': 'Outdoor', 
      'mixed': 'Mixed'
    };
    return typeMap[type] || type || 'Not specified';
  };

  const formatActivityLevelForDisplay = (level: string) => {
    const levelMap: { [key: string]: string } = {
      'sedentary': 'Sedentary',
      'light': 'Light',
      'moderate': 'Moderate',
      'active': 'Active',
      'very-active': 'Very Active'
    };
    return levelMap[level] || level || 'Not specified';
  };

  return (
    <div className="fixed inset-0 bg-[#110E0E] flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-4xl h-[calc(100vh-2rem)] bg-[#1A1515] rounded-xl shadow-2xl overflow-hidden flex">
        
        {/* Left Hero Section */}
        <div className="lg:w-2/5 relative h-48 lg:h-full">
          <img 
            src={fitnessHeroBg} 
            alt="Complete your fitness journey" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-red-900/80 to-red-600/60"></div>
          
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-white text-2xl font-bold font-['Manrope'] mb-2">
                You're All Set!
              </h1>
              <p className="text-white/90 text-sm font-['Manrope'] leading-relaxed">
                Your personalized fitness journey starts now
              </p>
            </div>
          </div>
        </div>

        {/* Right Content Section */}
        <div className="lg:w-3/5 bg-[#1A1515] p-5 flex flex-col h-full">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src={logoIcon} alt="FluxWell" className="w-6 h-6" />
              <span className="text-white text-lg font-bold font-['Manrope']">
                <span className="text-white">Flux</span><span className="text-[#EA2A2A]">Well</span>
              </span>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs font-['Manrope']">Step 3 of 3</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-1.5 mb-6">
            <div 
              className="bg-gradient-to-r from-red-500 to-red-600 h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{ width: '100%' }}
            ></div>
          </div>

          {/* Title */}
          <div className="mb-4">
            <h2 className="text-white text-xl font-bold font-['Manrope'] mb-2">
              Review Your Profile
            </h2>
            <p className="text-gray-400 text-sm font-['Manrope']">
              Confirm your details before we create your personalized plan
            </p>
          </div>

          {/* Data Cards - Scrollable Content */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            
            {/* Personal Information Card */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold font-['Manrope']">Personal Information</h3>
                </div>
                {onEditStep1 && (
                  <button
                    onClick={onEditStep1}
                    className="text-red-500 hover:text-red-400 transition-colors duration-200"
                    title="Edit personal information"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Gender</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{formatGender(step1Data.gender)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Age</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{calculateAge(step1Data.dateOfBirth)} years</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Height</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{formatHeight(step1Data.height)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Weight</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{step1Data.weight} kg</p>
                </div>
              </div>
            </div>

            {/* Fitness Goals Card */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-white text-sm font-semibold font-['Manrope']">Fitness Goals</h3>
              </div>
              <div className="space-y-2">
                {formatGoals(step2Data.fitnessGoals, step2Data.customGoal).map((goal, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0"></div>
                    <p className="text-white text-xs font-medium font-['Manrope']">{goal}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Health & Activity Card */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <h3 className="text-white text-sm font-semibold font-['Manrope']">Health & Activity</h3>
                </div>
                {onEditStep2 && (
                  <button
                    onClick={onEditStep2}
                    className="text-red-500 hover:text-red-400 transition-colors duration-200"
                    title="Edit health and activity preferences"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Medical Conditions</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">
                    {formatMedicalConditionsForDisplay(step2Data.medicalConditions, step2Data.otherMedicalCondition)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Activity Level</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">
                    {formatActivityLevelForDisplay(step2Data.activityLevel)}
                  </p>
                </div>
              </div>
            </div>

            {/* Workout Preferences Card */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-white text-sm font-semibold font-['Manrope']">Workout Preferences</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Time Available</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{step2Data.timeAvailable} min/day</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Workout Type</p>
                  <p className="text-white text-xs font-medium font-['Manrope']">{formatWorkoutType(step2Data.preferredWorkoutType)}</p>
                </div>
              </div>
            </div>

            {/* AI Assessment Card */}
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-white text-sm font-semibold font-['Manrope']">AI Health Assessment</h3>
              </div>

              {isLoadingAssessment ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-400 text-xs font-['Manrope']">Analyzing your profile...</p>
                  </div>
                </div>
              ) : assessmentError ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 mx-auto mb-3 bg-red-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-xs font-['Manrope'] mb-3">{assessmentError}</p>
                  <button
                    onClick={() => {
                      if (step1Data.gender && step1Data.dateOfBirth && step2Data.activityLevel) {
                        setAssessmentError(null);
                        generateAssessment();
                      }
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
                  >
                    Try Again
                  </button>
                </div>
              ) : aiAssessment ? (
                <div className="space-y-3">
                  {/* Health Score */}
                  <div className="bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-xs font-['Manrope']">Health Score</span>
                      <span className="text-white text-sm font-bold font-['Manrope']">{aiAssessment.health_score}/100</span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          aiAssessment.health_score >= 80 ? 'bg-green-500' :
                          aiAssessment.health_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${aiAssessment.health_score}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Time to Goal */}
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Estimated Time to Goal</p>
                      <p className="text-white text-xs font-medium font-['Manrope']">{aiAssessment.time_to_goal}</p>
                    </div>
                  </div>

                  {/* Motivational Message */}
                  <div className="bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-gray-400 text-xs font-['Manrope'] mb-1">Motivation</p>
                    <p className="text-white text-xs font-medium font-['Manrope'] leading-relaxed">
                      "{aiAssessment.motivational_message}"
                    </p>
                  </div>

                  {/* Risk Profile */}
                  {aiAssessment.risk_profile && aiAssessment.risk_profile.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-xs font-['Manrope'] mb-2">Health Considerations</p>
                      <div className="space-y-1">
                        {aiAssessment.risk_profile.map((risk, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full mt-1.5 flex-shrink-0"></div>
                            <p className="text-white text-xs font-medium font-['Manrope'] leading-relaxed">{risk}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-xs font-['Manrope']">Complete your profile to get AI insights</p>
                </div>
              )}
            </div>

          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 mt-4 border-t border-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 bg-transparent border border-gray-600 text-gray-300 font-medium font-['Manrope'] py-2.5 px-4 rounded-lg hover:bg-gray-700 hover:text-white hover:border-gray-500 transition-all duration-200 text-sm"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={onComplete}
              disabled={isLoadingAssessment}
              className={`flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium font-['Manrope'] py-2.5 px-4 rounded-lg transition-all duration-200 text-sm shadow-lg ${isLoadingAssessment ? 'opacity-60 cursor-not-allowed' : 'hover:from-red-600 hover:to-red-700'}`}
            >
              Start My Journey →
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default OnboardingStep3;
