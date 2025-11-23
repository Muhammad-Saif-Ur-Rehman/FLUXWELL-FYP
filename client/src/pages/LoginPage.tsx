import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import fitnessHeroBg from '../assets/images/fitness-login-hero.jpg';
import { API_ENDPOINTS } from '../config/api';

const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  useEffect(() => {
    const successParam = searchParams.get('success');
    const emailParam = searchParams.get('email');
    
    if (successParam === 'registration') {
      setSuccess('Account created successfully! Please login with your credentials.');
      if (emailParam) {
        setFormData(prev => ({ ...prev, email: decodeURIComponent(emailParam) }));
      }
    }

    const errorParam = searchParams.get('error');
    if (errorParam === 'oauth_failed') {
      setError('Google authentication failed. Please try again.');
    } else if (errorParam === 'fitbit_oauth_failed') {
      setError('Fitbit authentication failed. Please try again.');
    }
  }, [searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      // Validate form data
      if (!formData.email.trim()) {
        throw new Error('Email is required');
      }
      if (!formData.password) {
        throw new Error('Password is required');
      }

      // Submit login
      const response = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      // Success - store token and redirect
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setSuccess('Login successful! Redirecting...');
      
      // Use onboarding status from backend response
      const hasCompletedOnboarding = data.onboarding_completed;
      
      setTimeout(() => {
        if (!hasCompletedOnboarding) {
          navigate('/onboarding');
        } else {
          navigate('/dashboard');
        }
      }, 1500);

    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
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
      <div className="w-full max-w-6xl h-full flex bg-[#1A1515] rounded-2xl shadow-2xl overflow-hidden">
        {/* Left Side - Hero Image */}
        <div 
          className="hidden lg:flex lg:w-1/2 relative bg-cover bg-center"
          style={{ backgroundImage: `url(${fitnessHeroBg})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-900/80 to-red-600/60"></div>
          <div className="relative z-10 flex flex-col justify-center items-start p-12 text-white">
            <h1 className="text-5xl font-bold font-['Lexend'] mb-6 leading-tight">
              Welcome Back to <span className="text-white">Flux</span><span className="text-[#EA2A2A]">Well</span>
            </h1>
            <p className="text-xl font-['Manrope'] mb-8 leading-relaxed opacity-90">
              Continue your fitness journey with personalized workouts, nutrition tracking, and expert guidance.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💪</span>
                </div>
                <div>
                  <p className="font-semibold font-['Manrope']">Strength Training</p>
                  <p className="text-sm opacity-80 font-['Manrope']">Build muscle and endurance</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <p className="font-semibold font-['Manrope']">Progress Tracking</p>
                  <p className="text-sm opacity-80 font-['Manrope']">Monitor your achievements</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white font-['Lexend'] mb-2">
                Login to <span className="text-white">Flux</span><span className="text-[#EA2A2A]">Well</span>
              </h2>
              <p className="text-sm text-gray-300 font-['Manrope']">
                Access your personalized fitness dashboard.
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
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => handleSocialLogin('google')}
                className="flex-1 bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-3 px-4 text-white text-sm font-['Manrope'] hover:bg-white/10 transition-all duration-200 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button
                onClick={() => handleSocialLogin('fitbit')}
                className="flex-1 bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-3 px-4 text-white text-sm font-['Manrope'] hover:bg-white/10 transition-all duration-200 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#00B0B9" d="M13.298 1.756c0 .847.68 1.535 1.518 1.535.837 0 1.518-.688 1.518-1.535C16.334.908 15.653.22 14.816.22c-.838 0-1.518.688-1.518 1.536zm-.93 2.828c0 .7.564 1.268 1.26 1.268.695 0 1.26-.568 1.26-1.268 0-.7-.565-1.268-1.26-1.268-.696 0-1.26.568-1.26 1.268zm-1.082 2.64c0 .615.496 1.113 1.107 1.113.61 0 1.107-.498 1.107-1.113 0-.615-.497-1.113-1.107-1.113-.611 0-1.107.498-1.107 1.113zm-1.127 2.535c0 .532.43.963.961.963.531 0 .961-.431.961-.963 0-.532-.43-.963-.961-.963-.531 0-.961.431-.961.963zm-1.084 2.468c0 .454.367.821.82.821.453 0 .82-.367.82-.821 0-.454-.367-.821-.82-.821-.453 0-.82.367-.82.821zm-1.006 2.279c0 .376.304.681.68.681.376 0 .681-.305.681-.681 0-.376-.305-.681-.681-.681-.376 0-.68.305-.68.681zm-.887 2.046c0 .298.241.54.539.54.298 0 .539-.242.539-.54 0-.298-.241-.54-.539-.54-.298 0-.539.242-.539.54zm-.726 1.77c0 .22.178.398.398.398.22 0 .398-.178.398-.398 0-.22-.178-.398-.398-.398-.22 0-.398.178-.398.398zm-.527 1.453c0 .142.115.257.257.257.142 0 .257-.115.257-.257 0-.142-.115-.257-.257-.257-.142 0-.257.115-.257.257z"/>
                </svg>
                Fitbit
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#1A1515] px-3 text-gray-400 font-['Manrope']">or continue with email</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-3 px-4 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full bg-white/7 backdrop-blur-sm border border-white/10 rounded-lg py-3 px-4 text-white placeholder-gray-400 text-sm font-['Manrope'] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                  required
                />
              </div>

              {/* Forgot Password Link */}
              <div className="text-right">
                <a href="#" className="text-xs text-red-400 hover:text-red-300 font-['Manrope']">
                  Forgot Password?
                </a>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg text-sm font-['Manrope'] transition-all duration-200 shadow-lg shadow-red-500/20 mt-6"
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            {/* Signup Link */}
            <div className="text-center mt-6">
              <span className="text-xs text-gray-400 font-['Manrope']">
                Don't have an account?{' '}
                <Link to="/signup" className="text-red-500 hover:text-red-400 font-medium underline">
                  Sign up
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
