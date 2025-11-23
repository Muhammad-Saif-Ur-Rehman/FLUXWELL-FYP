import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingData, OnboardingStep1Data, OnboardingStep2Data, INITIAL_ONBOARDING_DATA } from '../../types/onboarding';
import { API_ENDPOINTS } from '../../config/api';
import OnboardingStep1 from './OnboardingStep1';
import OnboardingStep2 from './OnboardingStep2';
import OnboardingStep3 from './OnboardingStep3';

interface OnboardingWizardProps {
  isEditMode?: boolean;
  initialStep?: number;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ 
  isEditMode = false, 
  initialStep = 1 
}) => {
  const navigate = useNavigate();
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSocialData, setHasSocialData] = useState(false);
  const [socialProvider, setSocialProvider] = useState<string | null>(null);

  // Load existing onboarding data on component mount
  useEffect(() => {
    const loadOnboardingData = async () => {
      try {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
          setIsLoading(false);
          return;
        }

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log('Loaded onboarding data:', data);
          
          // Transform backend data to frontend format
          const transformedStep1 = {
            gender: data.step1?.gender || '',
            dateOfBirth: data.step1?.date_of_birth || '',
            weight: data.step1?.weight || '',
            height: data.step1?.height || '',
            profilePicture: null,
            profilePictureUrl: data.step1?.profile_picture_url || null
          };

          const transformedStep2 = {
            activityLevel: data.step2?.activity_level || '',
            medicalConditions: data.step2?.medical_conditions || [],
            fitnessGoals: data.step2?.fitness_goals || [],
            timeAvailable: data.step2?.time_available || '',
            preferredWorkoutType: data.step2?.preferred_workout_type || '',
            otherMedicalCondition: data.step2?.other_medical_condition || '',
            customGoal: data.step2?.custom_goal || ''
          };
          
          setOnboardingData({
            step1: transformedStep1,
            step2: transformedStep2,
            currentStep: isEditMode ? initialStep : (data.completed ? 3 : 1)
          });
          
          setHasSocialData(data.has_social_data || false);
          setSocialProvider(data.social_provider || null);
        } else {
          console.error('Failed to load onboarding data, using defaults');
          // Continue with default data instead of blocking
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('Data loading timeout, using defaults');
        } else {
          console.error('Error loading onboarding data, using defaults:', error);
        }
        // Continue with default data instead of blocking
      } finally {
        setIsLoading(false);
      }
    };

    loadOnboardingData();
  }, [isEditMode, initialStep]);

  const saveStep1Data = async (step1Data: OnboardingStep1Data) => {
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        console.log('No access token found, skipping backend save');
        return;
      }

      const payload = {
        gender: step1Data.gender || undefined,
        date_of_birth: step1Data.dateOfBirth || undefined,
        weight: step1Data.weight || undefined,
        height: step1Data.height || undefined,
        profile_picture_url: step1Data.profilePictureUrl || undefined,
      };

      console.log('Saving step 1 data to backend:', payload);

      const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_STEP1_UPDATE, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to save step 1 data to backend:', response.status, errorData);
        throw new Error(`Backend error: ${response.status}`);
      } else {
        const result = await response.json();
        console.log('Step 1 data saved to backend successfully:', result);
      }
    } catch (error) {
      console.error('Error saving step 1 data:', error);
      throw error; // Re-throw to handle in calling function
    }
  };

  const saveStep2Data = async (step2Data: OnboardingStep2Data) => {
    try {
      const accessToken = localStorage.getItem('access_token');
      if (!accessToken) {
        console.log('No access token found, skipping backend save');
        return;
      }

      const payload = {
        activity_level: step2Data.activityLevel,
        medical_conditions: step2Data.medicalConditions,
        fitness_goals: step2Data.fitnessGoals,
        time_available: step2Data.timeAvailable,
        preferred_workout_type: step2Data.preferredWorkoutType,
        other_medical_condition: step2Data.otherMedicalCondition,
        custom_goal: step2Data.customGoal
      };

      console.log('Saving step 2 data to backend:', payload);

      const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_STEP2_UPDATE, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to save step 2 data to backend:', response.status, errorData);
        throw new Error(`Backend error: ${response.status}`);
      } else {
        const result = await response.json();
        console.log('Step 2 data saved to backend successfully:', result);
      }
    } catch (error) {
      console.error('Error saving step 2 data:', error);
      throw error; // Re-throw to handle in calling function
    }
  };

  const handleStep1Next = (step1Data: OnboardingStep1Data) => {
    // Update state and navigate immediately for better UX
    setOnboardingData(prev => ({
      ...prev,
      step1: step1Data,
      currentStep: isEditMode ? prev.currentStep : 2
    }));
    
    // Store step 1 data locally as backup
    localStorage.setItem('onboarding_step1', JSON.stringify(step1Data));
    
    // If in edit mode, don't navigate to next step
    if (isEditMode) {
      return;
    }
    
    // Save to backend in background (don't block navigation)
    saveStep1Data(step1Data)
      .then(() => {
        console.log('Step 1 data saved to backend successfully');
      })
      .catch((error) => {
        console.error('Failed to save step 1 data to backend (background save):', error);
        // Could show a non-blocking notification here
      });
    
    console.log('Step 1 completed, navigating to step 2');
  };

  const handleStep2Next = (step2Data: OnboardingStep2Data) => {
    // Update state and navigate immediately for better UX
    setOnboardingData(prev => ({
      ...prev,
      step2: step2Data,
      currentStep: isEditMode ? prev.currentStep : 3
    }));
    
    // Store step 2 data locally as backup
    localStorage.setItem('onboarding_step2', JSON.stringify(step2Data));
    
    // If in edit mode, don't navigate to next step
    if (isEditMode) {
      return;
    }
    
    // Save to backend in background (don't block navigation)
    saveStep2Data(step2Data)
      .then(() => {
        console.log('Step 2 data saved to backend successfully');
      })
      .catch((error) => {
        console.error('Failed to save step 2 data to backend (background save):', error);
        // Could show a non-blocking notification here
      });
    
    console.log('Step 2 completed, navigating to step 3');
  };

  const handleStep2Back = () => {
    setOnboardingData(prev => ({
      ...prev,
      currentStep: 1
    }));
  };

    const handleStep3Complete = () => {
    console.log('Onboarding completed:', onboardingData);
    
    // Store completion locally immediately
    localStorage.setItem('onboarding_data', JSON.stringify(onboardingData));
    localStorage.setItem('onboarding_completed', 'true');
    
    // Small delay to ensure backend calls complete before navigation
    setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 500);
    
              // Mark onboarding as completed in the backend (background operation)
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      // Use the onboarding save endpoint with complete: true to ensure consistency
      // Map frontend step data to backend API shape to avoid wiping fields
      const step1Api = {
        gender: onboardingData.step1.gender || undefined,
        date_of_birth: onboardingData.step1.dateOfBirth || undefined,
        weight: onboardingData.step1.weight || undefined,
        height: onboardingData.step1.height || undefined,
        profile_picture_url: (onboardingData.step1 as any).profilePictureUrl || undefined,
      };
      const step2Api = {
        activity_level: onboardingData.step2.activityLevel || undefined,
        medical_conditions: onboardingData.step2.medicalConditions || undefined,
        fitness_goals: onboardingData.step2.fitnessGoals || undefined,
        time_available: onboardingData.step2.timeAvailable || undefined,
        preferred_workout_type: onboardingData.step2.preferredWorkoutType || undefined,
        other_medical_condition: onboardingData.step2.otherMedicalCondition || undefined,
        custom_goal: onboardingData.step2.customGoal || undefined,
      };

      fetch(API_ENDPOINTS.AUTH.ONBOARDING_SAVE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step1: step1Api,
          step2: step2Api,
          complete: true,
        }),
      })
      .then(response => {
        if (!response.ok) {
          console.error('Failed to mark onboarding as completed in backend');
        } else {
          console.log('Onboarding completion synced with backend');
          // Also call the complete-onboarding endpoint to ensure both flags are set
          return fetch(API_ENDPOINTS.AUTH.COMPLETE_ONBOARDING, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
        }
      })
      .then(response => {
        if (response && response.ok) {
          console.log('Both onboarding completion endpoints called successfully');
        }
      })
      .catch(error => {
        console.error('Error syncing onboarding completion:', error);
      });
    }
  };

  const handleStep3Back = () => {
    setOnboardingData(prev => ({
      ...prev,
      currentStep: 2
    }));
  };

  const handleStep1Back = () => {
    // Navigate back to the previous page (signup or dashboard)
    navigate(-1);
  };

  const handleEditStep1 = () => {
    setOnboardingData(prev => ({
      ...prev,
      currentStep: 1
    }));
  };

  const handleEditStep2 = () => {
    setOnboardingData(prev => ({
      ...prev,
      currentStep: 2
    }));
  };

  const renderCurrentStep = () => {
    switch (onboardingData.currentStep) {
      case 1:
        return (
          <OnboardingStep1
            data={onboardingData.step1}
            onNext={handleStep1Next}
            onBack={handleStep1Back}
          />
        );
      case 2:
        return (
          <OnboardingStep2
            data={onboardingData.step2}
            step1Data={onboardingData.step1}
            onNext={handleStep2Next}
            onBack={handleStep2Back}
          />
        );
      case 3:
        return (
          <OnboardingStep3
            step1Data={onboardingData.step1}
            step2Data={onboardingData.step2}
            onComplete={handleStep3Complete}
            onBack={handleStep3Back}
            onEditStep1={handleEditStep1}
            onEditStep2={handleEditStep2}
          />
        );
      default:
        return (
          <OnboardingStep1
            data={onboardingData.step1}
            onNext={handleStep1Next}
            onBack={handleStep1Back}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#110E0E] flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white text-lg font-['Manrope']">
            {hasSocialData ? `Loading your ${socialProvider} data...` : 'Loading your profile...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#110E0E] flex items-center justify-center p-8">
      {/* Background blur elements */}
      <div className="fixed -top-[314px] -left-[480px] w-[960px] h-[629px] rounded-full bg-red-500/20 blur-[150px]" />
      <div className="fixed -bottom-[314px] -right-[480px] w-[960px] h-[629px] rounded-full bg-red-500/10 blur-[150px]" />
      
      {/* Main Content - Centered Card */}
      <div className="relative z-10">
        {renderCurrentStep()}
      </div>
    </div>
  );
};

export default OnboardingWizard;
