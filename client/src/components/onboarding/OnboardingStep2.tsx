import React, { useState, useEffect } from 'react';
import { OnboardingStep2Data, GoalFeasibilityRequest, GoalFeasibilityResponse } from '../../types/onboarding';
import { API_ENDPOINTS } from '../../config/api';
import step2Bg from '../../assets/images/onboarding-step2-bg-56586a.png';
import logoIcon from '../../assets/images/movement-icon.svg';

interface OnboardingStep2Props {
  data: OnboardingStep2Data;
  step1Data?: any; // We need step1 data for goal feasibility check
  onNext: (data: OnboardingStep2Data) => void;
  onBack: () => void;
}

const OnboardingStep2: React.FC<OnboardingStep2Props> = ({ data, step1Data, onNext, onBack }) => {
  const [formData, setFormData] = useState<OnboardingStep2Data>(data);
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);
  const [showWorkoutTypeDropdown, setShowWorkoutTypeDropdown] = useState(false);
  const [otherMedicalCondition, setOtherMedicalCondition] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  
  // Goal feasibility state
  const [goalFeasibility, setGoalFeasibility] = useState<{[key: string]: GoalFeasibilityResponse}>({});
  const [checkingFeasibility, setCheckingFeasibility] = useState<{[key: string]: boolean}>({});
  const [feasibilityErrors, setFeasibilityErrors] = useState<{[key: string]: string}>({});

  // Check feasibility when custom goal changes
  useEffect(() => {
    if (formData.fitnessGoals.includes('custom') && step1Data && formData.activityLevel) {
      if (customGoal.trim()) {
        // If custom goal has text, check feasibility
        const timeoutId = setTimeout(() => {
          checkGoalFeasibility('custom', customGoal.trim());
        }, 1000); // Debounce to avoid too many API calls
        
        return () => clearTimeout(timeoutId);
      } else {
        // If custom goal is empty, clear any existing feasibility result and errors
        setGoalFeasibility(prev => {
          const newFeasibility = { ...prev };
          delete newFeasibility['custom'];
          return newFeasibility;
        });
        setFeasibilityErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors['custom'];
          return newErrors;
        });
      }
    }
  }, [customGoal, formData.activityLevel, formData.fitnessGoals]);

  const activityLevels = [
    { value: 'sedentary', label: 'Sedentary' },
    { value: 'light', label: 'Light' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'active', label: 'Active' },
    { value: 'very-active', label: 'Very Active' }
  ];

  const medicalConditions = [
    { value: 'back-problems', label: 'Back Problems' },
    { value: 'knee-problems', label: 'Knee Problems' },
    { value: 'shoulder-problems', label: 'Shoulder Problems' },
    { value: 'heart-condition', label: 'Heart Condition' },
    { value: 'joint-pain', label: 'Joint Pain' },
    { value: 'other', label: 'Other' },
    { value: 'none', label: 'None' }
  ];

  const fitnessGoals = [
    { value: 'lose-weight', label: 'Lose Weight' },
    { value: 'gain-muscle', label: 'Gain Muscle' },
    { value: 'improve-endurance', label: 'Improve Endurance' },
    { value: 'maintain-health', label: 'Maintain Health' },
    { value: 'custom', label: 'Custom' }
  ];

  const workoutTypes = [
    { value: 'gym', label: 'Gym' },
    { value: 'home', label: 'Home' },
    { value: 'outdoor', label: 'Outdoor' },
    { value: 'mixed', label: 'Mixed' }
  ];

  const handleInputChange = (field: keyof OnboardingStep2Data, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMedicalConditionToggle = (condition: string) => {
    setFormData(prev => {
      let newConditions = [...prev.medicalConditions];
      
      // If selecting "None", clear all other conditions and clear other input
      if (condition === 'none') {
        newConditions = newConditions.includes('none') ? [] : ['none'];
        setOtherMedicalCondition('');
      } else {
        // Remove "None" if selecting any other condition
        newConditions = newConditions.filter(c => c !== 'none');
        
        // If unselecting "other", clear the input
        if (condition === 'other' && newConditions.includes('other')) {
          setOtherMedicalCondition('');
        }
        
        // Toggle the selected condition
        if (newConditions.includes(condition)) {
          newConditions = newConditions.filter(c => c !== condition);
        } else {
          newConditions.push(condition);
        }
      }
      
      return {
        ...prev,
        medicalConditions: newConditions
      };
    });
  };

  // Function to check goal feasibility
  const checkGoalFeasibility = async (goal: string, customGoalText?: string) => {
    if (!step1Data || !formData.activityLevel) {
      return; // Can't check without basic data
    }

    // Don't check feasibility for empty custom goals
    if (goal === 'custom' && (!customGoalText || !customGoalText.trim())) {
      return;
    }

    const goalKey = goal === 'custom' ? 'custom' : goal;
    
    // Clear any existing results and errors for this goal before checking
    setGoalFeasibility(prev => {
      const newFeasibility = { ...prev };
      delete newFeasibility[goalKey];
      return newFeasibility;
    });
    setFeasibilityErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[goalKey];
      return newErrors;
    });
    
    setCheckingFeasibility(prev => ({ ...prev, [goalKey]: true }));

    try {
      const requestData: GoalFeasibilityRequest = {
        gender: step1Data.gender || '',
        date_of_birth: step1Data.dateOfBirth || '',
        weight: parseFloat(step1Data.weight) || 0,
        height: step1Data.height, // Keep as string to preserve feet'inches" format
        activity_level: formData.activityLevel,
        medical_conditions: formData.medicalConditions.includes('other') 
          ? [...formData.medicalConditions.filter(c => c !== 'other'), otherMedicalCondition]
          : formData.medicalConditions,
        selected_goal: goal === 'custom' ? 'Custom' : goal,
        custom_goal: customGoalText || ''
      };

      const response = await fetch(API_ENDPOINTS.AI.GOAL_FEASIBILITY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('Failed to check goal feasibility');
      }

      const feasibilityResult: GoalFeasibilityResponse = await response.json();
      
      // Clear any errors for this goal when we get a successful result
      setFeasibilityErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[goalKey];
        return newErrors;
      });
      
      setGoalFeasibility(prev => ({ ...prev, [goalKey]: feasibilityResult }));

    } catch (error) {
      console.error('Goal feasibility check failed:', error);
      setFeasibilityErrors(prev => ({ 
        ...prev, 
        [goalKey]: 'Unable to check goal feasibility. Please try again.' 
      }));
    } finally {
      setCheckingFeasibility(prev => ({ ...prev, [goalKey]: false }));
    }
  };

  const handleFitnessGoalToggle = (goal: string) => {
    setFormData(prev => {
      let newGoals;
      
      if (prev.fitnessGoals.includes(goal)) {
        // If clicking on already selected goal, unselect it
        newGoals = prev.fitnessGoals.filter(g => g !== goal);
        // If unselecting "custom", clear the custom input
        if (goal === 'custom') {
          setCustomGoal('');
        }
      } else {
        // Single selection: replace all previous goals with the new one
        newGoals = [goal];
        
        // Clear custom goal if selecting a non-custom goal
        if (goal !== 'custom') {
          setCustomGoal('');
        }
        
        // Clear all existing feasibility results when switching goals
        setGoalFeasibility({});
        setFeasibilityErrors({});
        
        // Check feasibility when goal is selected (only if not custom or if custom has text)
        if (step1Data && formData.activityLevel) {
          if (goal !== 'custom' || (goal === 'custom' && customGoal.trim())) {
            setTimeout(() => checkGoalFeasibility(goal), 500); // Small delay to let UI update
          }
        }
      }
      
      return {
        ...prev,
        fitnessGoals: newGoals
      };
    });
  };

  // Helper function to get feasibility result for a goal
  const getFeasibilityResult = (goal: string, customGoalText?: string) => {
    const goalKey = goal === 'custom' ? 'custom' : goal;
    return {
      result: goalFeasibility[goalKey],
      isChecking: checkingFeasibility[goalKey],
      error: feasibilityErrors[goalKey]
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.activityLevel) {
      alert('Please select your activity level');
      return;
    }
    if (formData.medicalConditions.length === 0) {
      alert('Please select your medical conditions or "None"');
      return;
    }
    if (formData.medicalConditions.includes('other') && !otherMedicalCondition.trim()) {
      alert('Please specify your other medical condition');
      return;
    }
    if (formData.fitnessGoals.length === 0) {
      alert('Please select a fitness goal');
      return;
    }
    if (formData.fitnessGoals.includes('custom') && !customGoal.trim()) {
      alert('Please specify your custom fitness goal');
      return;
    }
    if (!formData.timeAvailable) {
      alert('Please enter your available exercise time');
      return;
    }
    if (!formData.preferredWorkoutType) {
      alert('Please select your preferred workout type');
      return;
    }
    
    // Include other medical condition and custom goal in the data if specified
    const submitData = {
      ...formData,
      otherMedicalCondition: formData.medicalConditions.includes('other') ? otherMedicalCondition : '',
      customGoal: formData.fitnessGoals.includes('custom') ? customGoal : ''
    };
    
    onNext(submitData);
  };

  return (
    <div className="fixed inset-0 bg-[#110E0E] flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-4xl h-[calc(100vh-2rem)] bg-[#1A1515] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left Hero Section */}
          <div className="lg:w-2/5 relative h-48 lg:h-full">
            <img 
              src={step2Bg} 
              alt="Person with smartwatch showing health data" 
              className="w-full h-full object-cover"
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-transparent" />
            
            {/* Content Overlay */}
            <div className="absolute inset-0 flex flex-col justify-center items-start p-4">
              <div className="max-w-xs">
                <h1 className="text-lg font-bold font-['Lexend'] text-white mb-2 leading-tight">
                  Your Fitness <span className="text-red-400">Lifestyle</span>
                </h1>
                <p className="text-gray-200 text-xs font-['Manrope'] mb-3 leading-relaxed">
                  Help us understand your current activity level and health to create the perfect plan for you.
                </p>
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">
                    <span className="text-xs">🎯</span>
                  </div>
                  <span className="text-xs font-['Manrope']">Tailored to your goals</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Section */}
          <div className="lg:w-3/5 bg-[#1A1515] p-5 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <img src={logoIcon} alt="FluxWell" className="w-6 h-6" />
                <h1 className="text-white text-lg font-bold font-['Lexend']">
                  <span className="text-white">Flux</span><span className="text-[#EA2A2A]">Well</span>
                </h1>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-xs font-['Manrope']">Step 2 of 3</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-xs font-['Manrope'] font-medium">Lifestyle & Goals</span>
                <span className="text-gray-400 text-xs font-['Manrope']">67%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-gradient-to-r from-red-500 to-red-400 h-1.5 rounded-full transition-all duration-300" style={{ width: '66.66%' }}></div>
              </div>
            </div>

            {/* Title */}
            <div className="mb-4">
              <h2 className="text-white text-base font-bold font-['Lexend'] mb-1">
                Tell us about your lifestyle
              </h2>
              <p className="text-gray-400 text-xs font-['Manrope']">
                This helps us create your personalized fitness plan
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 space-y-2.5 overflow-y-auto pr-2">
                {/* Activity Level Field */}
                <div>
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Activity Level <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowActivityDropdown(!showActivityDropdown)}
                      className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-left text-white font-['Manrope'] hover:bg-gray-700/50 transition-colors duration-200 flex items-center justify-between text-sm"
                    >
                      <span className={formData.activityLevel ? 'text-white' : 'text-gray-400'}>
                        {formData.activityLevel ? activityLevels.find(opt => opt.value === formData.activityLevel)?.label : 'Select your activity level'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {showActivityDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10">
                        {activityLevels.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              handleInputChange('activityLevel', option.value);
                              setShowActivityDropdown(false);
                            }}
                            className="w-full px-3 py-2 text-left text-white font-['Manrope'] hover:bg-gray-700 transition-colors duration-200 first:rounded-t-lg last:rounded-b-lg text-sm"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Medical Conditions Field */}
                <div>
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Medical Conditions <span className="text-red-400">*</span>
                  </label>
                  <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-2.5">
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {medicalConditions.map((condition) => (
                        <label
                          key={condition.value}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/30 p-1 rounded transition-colors"
                        >
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={formData.medicalConditions.includes(condition.value)}
                              onChange={() => handleMedicalConditionToggle(condition.value)}
                              className="sr-only"
                            />
                            <div className={`
                              w-3.5 h-3.5 rounded border flex items-center justify-center transition-all duration-200
                              ${formData.medicalConditions.includes(condition.value)
                                ? 'bg-red-500 border-red-500'
                                : 'bg-gray-700 border-gray-600'
                              }
                            `}>
                              {formData.medicalConditions.includes(condition.value) && (
                                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                          <span className="text-white font-['Manrope'] text-xs">
                            {condition.label}
                          </span>
                        </label>
                      ))}
                    </div>
                    
                    {/* Other Medical Condition Input */}
                    {formData.medicalConditions.includes('other') && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <input
                          type="text"
                          value={otherMedicalCondition}
                          onChange={(e) => setOtherMedicalCondition(e.target.value)}
                          placeholder="Please specify your medical condition..."
                          className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Fitness Goals Field */}
                <div>
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Fitness Goal (Select One) <span className="text-red-400">*</span>
                  </label>
                  <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-2.5">
                    <div className="grid grid-cols-1 gap-2 mb-2">
                      {fitnessGoals.map((goal) => {
                        const feasibility = getFeasibilityResult(goal.value);
                        const isSelected = formData.fitnessGoals.includes(goal.value);
                        
                        return (
                          <div key={goal.value} className="space-y-1">
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-700/30 p-2 rounded transition-colors">
                              <div className="relative">
                                <input
                                  type="radio"
                                  name="fitness-goal"
                                  checked={isSelected}
                                  onChange={() => handleFitnessGoalToggle(goal.value)}
                                  className="sr-only"
                                />
                                <div className={`
                                  w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200
                                  ${isSelected
                                    ? 'bg-red-500 border-red-500'
                                    : 'bg-gray-700 border-gray-600'
                                  }
                                `}>
                                  {isSelected && (
                                    <div className="w-2 h-2 rounded-full bg-white"></div>
                                  )}
                                </div>
                              </div>
                              <span className="text-white font-['Manrope'] text-sm flex-1">
                                {goal.label}
                              </span>
                              
                              {/* Feasibility indicator */}
                              {isSelected && (
                                <div className="ml-auto">
                                  {feasibility.isChecking && (
                                    <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                                  )}
                                  {feasibility.result && !feasibility.isChecking && (
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                      feasibility.result.feasible ? 'bg-green-500' : 'bg-red-500'
                                    }`}>
                                      <span className="text-white text-xs">
                                        {feasibility.result.feasible ? '✓' : '✗'}
                                      </span>
                                    </div>
                                  )}
                                  {feasibility.error && !feasibility.isChecking && (
                                    <div className="w-4 h-4 rounded-full bg-gray-500 flex items-center justify-center">
                                      <span className="text-white text-xs">?</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </label>
                            
                            {/* Feasibility feedback */}
                            {isSelected && feasibility.result && !feasibility.isChecking && (
                              <div className={`ml-6 p-2 rounded-lg text-xs font-['Manrope'] ${
                                feasibility.result.feasible 
                                  ? 'bg-green-900/30 border border-green-700 text-green-300'
                                  : 'bg-red-900/30 border border-red-700 text-red-300'
                              }`}>
                                <p className="mb-1">
                                  <strong>{feasibility.result.feasible ? 'Feasible!' : 'Not Recommended:'}</strong>
                                </p>
                                <p className="mb-1">{feasibility.result.reason}</p>
                                {!feasibility.result.feasible && feasibility.result.recommended_goal && (
                                  <p className="text-blue-300">
                                    <strong>Recommended:</strong> {feasibility.result.recommended_goal}
                                  </p>
                                )}
                              </div>
                            )}
                            
                            {/* Error feedback */}
                            {isSelected && feasibility.error && !feasibility.isChecking && (
                              <div className="ml-6 p-2 rounded-lg text-xs font-['Manrope'] bg-gray-800/50 border border-gray-600 text-gray-300">
                                {feasibility.error}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Custom Goal Input */}
                    {formData.fitnessGoals.includes('custom') && (
                      <div className="mt-2 pt-2 border-t border-gray-700 space-y-2">
                        <input
                          type="text"
                          value={customGoal}
                          onChange={(e) => setCustomGoal(e.target.value)}
                          placeholder="Please specify your custom fitness goal..."
                          className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-xs"
                        />
                        
                        {/* Custom goal feasibility feedback */}
                        {customGoal.trim() ? (
                          <div>
                            {(() => {
                              const customFeasibility = getFeasibilityResult('custom', customGoal.trim());
                              
                              if (customFeasibility.isChecking) {
                                return (
                                  <div className="flex items-center gap-2 text-yellow-400 text-xs font-['Manrope']">
                                    <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Checking feasibility...</span>
                                  </div>
                                );
                              }
                              
                              // if (customFeasibility.result) {
                              //   return (
                              //     <div className={`p-2 rounded-lg text-xs font-['Manrope'] ${
                              //       customFeasibility.result.feasible 
                              //         ? 'bg-green-900/30 border border-green-700 text-green-300'
                              //         : 'bg-red-900/30 border border-red-700 text-red-300'
                              //     }`}>
                              //       <p className="mb-1">
                              //         <strong>{customFeasibility.result.feasible ? 'Feasible!' : 'Not Recommended:'}</strong>
                              //       </p>
                              //       <p className="mb-1">{customFeasibility.result.reason}</p>
                              //       {!customFeasibility.result.feasible && customFeasibility.result.recommended_goal && (
                              //         <p className="text-blue-300">
                              //           <strong>Recommended:</strong> {customFeasibility.result.recommended_goal}
                              //         </p>
                              //       )}
                              //     </div>
                              //   );
                              // }
                              
                              // if (customFeasibility.error) {
                              //   return (
                              //     <div className="p-2 rounded-lg text-xs font-['Manrope'] bg-gray-800/50 border border-gray-600 text-gray-300">
                              //       {customFeasibility.error}
                              //     </div>
                              //   );
                              // }
                              
                              return null;
                            })()}
                          </div>
                        ) : (
                          <div className="text-gray-400 text-xs font-['Manrope'] italic">
                            Enter your custom fitness goal to check feasibility
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Time Available and Workout Type Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Time Available Field */}
                  <div>
                    <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                      Exercise Time (min/day) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.timeAvailable}
                      onChange={(e) => handleInputChange('timeAvailable', e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-sm"
                      placeholder="30"
                      min="5"
                      max="120"
                    />
                  </div>

                  {/* Preferred Workout Type Field */}
                  <div>
                    <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                      Workout Type <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowWorkoutTypeDropdown(!showWorkoutTypeDropdown)}
                        className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-left text-white font-['Manrope'] hover:bg-gray-700/50 transition-colors duration-200 flex items-center justify-between text-sm"
                      >
                        <span className={formData.preferredWorkoutType ? 'text-white' : 'text-gray-400'}>
                          {formData.preferredWorkoutType ? workoutTypes.find(opt => opt.value === formData.preferredWorkoutType)?.label : 'Select type'}
                        </span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {showWorkoutTypeDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10">
                          {workoutTypes.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                handleInputChange('preferredWorkoutType', option.value);
                                setShowWorkoutTypeDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left text-white font-['Manrope'] hover:bg-gray-700 transition-colors duration-200 first:rounded-t-lg last:rounded-b-lg text-sm"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 mt-3 border-t border-gray-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-1 bg-transparent border border-gray-600 text-gray-300 font-medium font-['Manrope'] py-2 px-4 rounded-lg hover:bg-gray-700 hover:text-white hover:border-gray-500 transition-all duration-200 text-sm"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium font-['Manrope'] py-2 px-4 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl text-sm"
                >
                  Continue →
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingStep2;
