import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import signupHeroBg from '../assets/images/signup-hero-bg-630ad8.png';
import { API_ENDPOINTS } from '../config/api';

const SignupPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    gender: '',
    dateOfBirth: '',
    agreeToTerms: false
  });

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'oauth_failed') {
      setError('Google authentication failed. Please try again.');
    } else if (errorParam === 'fitbit_oauth_failed') {
      setError('Fitbit authentication failed. Please try again.');
    }
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      // Validate form data
      if (!formData.fullName.trim()) {
        throw new Error('Full name is required');
      }
      if (!formData.email.trim()) {
        throw new Error('Email is required');
      }
      if (!formData.password) {
        throw new Error('Password is required');
      }
      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (formData.password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      if (!formData.gender) {
        throw new Error('Gender is required');
      }
      if (!formData.dateOfBirth) {
        throw new Error('Date of birth is required');
      }
      if (!formData.agreeToTerms) {
        throw new Error('You must agree to the terms and conditions');
      }

      // Submit registration
      const response = await fetch(API_ENDPOINTS.AUTH.REGISTER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Success - show success message and redirect to login
      setSuccess('Account created successfully! Redirecting to login...');
      
      setTimeout(() => {
        navigate('/login?success=registration&email=' + encodeURIComponent(formData.email));
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider: 'google' | 'fitbit') => {
    if (provider === 'google') {
      // Redirect to backend Google OAuth endpoint
      window.location.href = API_ENDPOINTS.AUTH.GOOGLE;
    } else if (provider === 'fitbit') {
      // Redirect to backend Fitbit OAuth endpoint
      window.location.href = API_ENDPOINTS.AUTH.FITBIT;
    }
  };

  return (
    <div className="h-screen bg-[#110E0E] flex items-center justify-center p-4 overflow-hidden">
      {/* Background blur elements */}
      <div className="fixed -top-[314px] -left-[480px] w-[960px] h-[629px] rounded-full bg-red-500/20 blur-[150px]" />
      <div className="fixed top-[943px] left-[1440px] w-[960px] h-[629px] rounded-full bg-red-500/10 blur-[150px]" />
      
      <div className="flex w-full max-w-[900px] h-[600px] shadow-2xl rounded-2xl overflow-hidden">
        {/* Left Hero Section */}
        <div className="relative w-1/2 bg-cover bg-center rounded-l-2xl overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${signupHeroBg})` }}
          />
          
          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
          <div className="absolute inset-0 bg-gradient-radial from-white/5 via-transparent to-transparent opacity-50" />
          
          {/* Content */}
          <div className="relative z-10 flex flex-col justify-end h-full p-8">
            <h1 className="text-2xl font-bold text-white mb-3 font-['Manrope']">
              Embrace a Healthier You.
            </h1>
            <p className="text-sm text-gray-300 font-['Manrope']">
              "The greatest wealth is health." - Virgil
            </p>
          </div>
        </div>

        {/* Right Form Section */}
        <div className="relative w-1/2 bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-r-2xl">
          {/* Glass morphism background */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-xl" />
          
          {/* Background pattern (very subtle) */}
          <div className="absolute inset-0 opacity-[0.02]">
            <div className="w-full h-full bg-repeat" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }} />
          </div>

          <div className="relative z-10 p-6 h-full flex flex-col justify-center">
            {/* Header */}
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-white mb-2 font-['Manrope']" 
                  style={{ textShadow: '0px 0px 5px rgba(239, 68, 68, 0.3), 0px 0px 15px rgba(239, 68, 68, 0.4)' }}>
                Register to <span className="text-white">Flux</span><span className="text-[#EA2A2A]">Well</span>
              </h2>
              <p className="text-sm text-gray-300 font-['Manrope']">
                Start your wellness journey today.
              </p>
              {error && (
                <div className="mt-3 p-2 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-xs text-red-300 font-['Manrope']">{error}</p>
                </div>
              )}
              {success && (
                <div className="mt-3 p-2 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <p className="text-xs text-green-300 font-['Manrope']">{success}</p>
                </div>
              )}
            </div>

            {/* Social Login Buttons */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => handleSocialLogin('google')}
                className="flex-1 flex items-center justify-center gap-2 bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white hover:bg-white/10 transition-all duration-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                <span className="text-xs font-medium font-['Manrope']">Google</span>
              </button>
              
              <button
                onClick={() => handleSocialLogin('fitbit')}
                className="flex-1 flex items-center justify-center gap-2 bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white hover:bg-white/10 transition-all duration-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#00B0B9" d="M13.298 1.756c0 .847.68 1.535 1.518 1.535.837 0 1.518-.688 1.518-1.535C16.334.908 15.653.22 14.816.22c-.838 0-1.518.688-1.518 1.536zm-.93 2.828c0 .7.564 1.268 1.26 1.268.695 0 1.26-.568 1.26-1.268 0-.7-.565-1.268-1.26-1.268-.696 0-1.26.568-1.26 1.268zm-1.082 2.64c0 .615.496 1.113 1.107 1.113.61 0 1.107-.498 1.107-1.113 0-.615-.497-1.113-1.107-1.113-.611 0-1.107.498-1.107 1.113zm-1.127 2.535c0 .532.43.963.961.963.531 0 .961-.431.961-.963 0-.532-.43-.963-.961-.963-.531 0-.961.431-.961.963zm-1.084 2.468c0 .454.367.821.82.821.453 0 .82-.367.82-.821 0-.454-.367-.821-.82-.821-.453 0-.82.367-.82.821zm-1.006 2.279c0 .376.304.681.68.681.376 0 .681-.305.681-.681 0-.376-.305-.681-.681-.681-.376 0-.68.305-.68.681zm-.887 2.046c0 .298.241.54.539.54.298 0 .539-.242.539-.54 0-.298-.241-.54-.539-.54-.298 0-.539.242-.539.54zm-.726 1.77c0 .22.178.398.398.398.22 0 .398-.178.398-.398 0-.22-.178-.398-.398-.398-.22 0-.398.178-.398.398zm-.527 1.453c0 .142.115.257.257.257.142 0 .257-.115.257-.257 0-.142-.115-.257-.257-.257-.142 0-.257.115-.257.257z"/>
                  </svg>
                <span className="text-xs font-medium font-['Manrope']">Fitbit</span>
              </button>
            </div>

            {/* Separator */}
            <div className="flex items-center my-3">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="px-3 text-xs text-gray-400 font-['Manrope']">OR</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Name and Email Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    name="fullName"
                    placeholder="Full Name"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                    required
                  />
                </div>
                <div>
                  <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                    required
                  />
                </div>
              </div>

              {/* Password Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                    required
                  />
                </div>
                <div>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                    required
                  />
                </div>
              </div>

              {/* Gender and Date of Birth Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-3 px-4 text-white text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 appearance-none"
                    required
                  >
                    <option value="" className="bg-gray-800 text-gray-400">Gender</option>
                    <option value="male" className="bg-gray-800 text-white">Male</option>
                    <option value="female" className="bg-gray-800 text-white">Female</option>
                    <option value="other" className="bg-gray-800 text-white">Other</option>
                    <option value="prefer-not-to-say" className="bg-gray-800 text-white">Prefer not to say</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <input
                    type="date"
                    name="dateOfBirth"
                    placeholder="Date of Birth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-2 px-3 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                    required
                  />
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="flex items-start gap-3 mt-3">
                <input
                  type="checkbox"
                  name="agreeToTerms"
                  checked={formData.agreeToTerms}
                  onChange={handleInputChange}
                  className="mt-1 w-4 h-4 bg-white/7 border border-white/10 rounded text-red-500 focus:ring-red-500/50 focus:ring-2"
                  required
                />
                <label className="text-xs text-gray-400 font-['Manrope'] leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" className="text-red-500 hover:text-red-400 font-medium underline">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-red-500 hover:text-red-400 font-medium underline">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg text-sm font-['Manrope'] transition-all duration-200 shadow-lg shadow-red-500/20 mt-3"
              >
                {isLoading ? 'Creating Account...' : 'Continue'}
              </button>
            </form>

            {/* Login Link */}
            <div className="text-center mt-3">
              <span className="text-xs text-gray-400 font-['Manrope']">
                Already have an account?{' '}
                <Link to="/login" className="text-red-500 hover:text-red-400 font-medium underline">
                  Login
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
