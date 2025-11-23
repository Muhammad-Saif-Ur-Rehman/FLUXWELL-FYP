import React, { useState } from 'react';
import { OnboardingStep1Data } from '../../types/onboarding';
import logoIcon from '../../assets/images/logo-icon.svg';
import modernGymHero from '../../assets/images/modern-gym-hero.jpg';

interface OnboardingStep1Props {
  data: OnboardingStep1Data;
  onNext: (data: OnboardingStep1Data) => void;
  onBack: () => void;
}

const OnboardingStep1: React.FC<OnboardingStep1Props> = ({ data, onNext, onBack }) => {
  const [formData, setFormData] = useState<OnboardingStep1Data>(data);
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [profilePreview, setProfilePreview] = useState<string | null>(null);

  // Initialize height fields from existing height string
  React.useEffect(() => {
    if (data.height && data.height.includes("'")) {
      const [feet, inches] = data.height.split("'");
      setHeightFeet(feet);
      setHeightInches(inches.replace('"', '').trim());
    }
  }, [data.height]);

  const handleInputChange = (field: keyof OnboardingStep1Data, value: string | File | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleHeightChange = (feet: string, inches: string) => {
    setHeightFeet(feet);
    setHeightInches(inches);
    const heightString = `${feet}'${inches}"`;
    handleInputChange('height', heightString);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleInputChange('profilePicture', file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePreview(e.target?.result as string);
        // Save base64 data URL so it can be persisted to backend as profile_picture_url
        handleInputChange('profilePictureUrl', (e.target?.result as string) || '');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Basic validation
    if (!formData.gender || !formData.dateOfBirth || !formData.weight || !formData.height) {
      alert('Please fill in all required fields');
      return;
    }
    onNext(formData);
  };

  const genderOptions = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' }
  ];

  return (
    <div className="fixed inset-0 bg-[#110E0E] flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-4xl h-[calc(100vh-2rem)] bg-[#1A1515] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left Hero Section */}
          <div className="lg:w-2/5 relative h-48 lg:h-full">
            <img 
              src={modernGymHero} 
              alt="Modern gym and fitness environment" 
              className="w-full h-full object-cover"
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-transparent" />
            
            {/* Content Overlay */}
            <div className="absolute inset-0 flex flex-col justify-center items-start p-4">
              <div className="max-w-xs">
                <h1 className="text-lg font-bold font-['Lexend'] text-white mb-2 leading-tight">
                  Start Your Fitness <span className="text-red-400">Journey</span>
                </h1>
                <p className="text-gray-200 text-xs font-['Manrope'] mb-3 leading-relaxed">
                  Tell us about yourself so we can create a personalized fitness plan just for you.
                </p>
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center">
                    <span className="text-xs">💪</span>
                  </div>
                  <span className="text-xs font-['Manrope']">Personalized just for you</span>
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
                <p className="text-gray-400 text-xs font-['Manrope']">Step 1 of 3</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-xs font-['Manrope'] font-medium">Personal Information</span>
                <span className="text-gray-400 text-xs font-['Manrope']">33%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-gradient-to-r from-red-500 to-red-400 h-1.5 rounded-full transition-all duration-300" style={{ width: '33.33%' }}></div>
              </div>
            </div>

            {/* Title */}
            <div className="mb-4">
              <h2 className="text-white text-base font-bold font-['Lexend'] mb-1">
                Tell us about yourself
              </h2>
              <p className="text-gray-400 text-xs font-['Manrope']">
                Help us create your personalized fitness experience
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
              <div className="flex-1 space-y-2.5">
                {/* Profile Picture Upload */}
                <div className="bg-gray-800/50 rounded-lg p-2.5 border border-gray-700">
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Profile Picture <span className="text-gray-400">(Optional)</span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-gray-700 border border-gray-600 overflow-hidden flex items-center justify-center">
                      {profilePreview ? (
                        <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="bg-red-500 hover:bg-red-600 text-white font-medium font-['Manrope'] py-1.5 px-2.5 rounded-lg transition-colors duration-200 text-xs text-center">
                        {formData.profilePicture ? 'Change Photo' : 'Upload Photo'}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Gender Field */}
                <div>
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Gender <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowGenderDropdown(!showGenderDropdown)}
                      className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-left text-white font-['Manrope'] hover:bg-gray-700/50 transition-colors duration-200 flex items-center justify-between text-sm"
                    >
                      <span className={formData.gender ? 'text-white' : 'text-gray-400'}>
                        {formData.gender ? genderOptions.find(opt => opt.value === formData.gender)?.label : 'Select your gender'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {showGenderDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10">
                        {genderOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              handleInputChange('gender', option.value);
                              setShowGenderDropdown(false);
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

                {/* Date of Birth Field */}
                <div>
                  <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                    Date of Birth <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-sm"
                  />
                </div>

                {/* Weight and Height Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Weight Field */}
                  <div>
                    <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                      Weight (kg) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) => handleInputChange('weight', e.target.value)}
                      className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-sm"
                      placeholder="70"
                      min="1"
                      max="300"
                    />
                  </div>

                  {/* Height Field */}
                  <div>
                    <label className="block text-white text-xs font-medium font-['Manrope'] mb-1.5">
                      Height <span className="text-red-400">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={heightFeet}
                          onChange={(e) => handleHeightChange(e.target.value, heightInches)}
                          className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-2 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-center text-sm"
                          placeholder="5"
                          min="3"
                          max="8"
                        />
                        <p className="text-gray-500 text-xs mt-0.5 text-center">ft</p>
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={heightInches}
                          onChange={(e) => handleHeightChange(heightFeet, e.target.value)}
                          className="w-full bg-gray-800/50 border border-gray-600 rounded-lg px-2 py-2 text-white font-['Manrope'] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors duration-200 text-center text-sm"
                          placeholder="10"
                          min="0"
                          max="11"
                        />
                        <p className="text-gray-500 text-xs mt-0.5 text-center">in</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 mt-3 border-t border-gray-700">
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

export default OnboardingStep1;
