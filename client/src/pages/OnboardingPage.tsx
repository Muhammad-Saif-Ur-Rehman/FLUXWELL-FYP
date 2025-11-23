import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Check if token is passed via URL (from OAuth callback)
      const urlToken = searchParams.get('token');
      const isNewUser = searchParams.get('new_user') === 'true';
      
      if (urlToken) {
        // Store the token and redirect to clean URL
        localStorage.setItem('access_token', urlToken);
        
        // Fetch user data using the token
        try {
          const response = await fetch('http://localhost:8000/auth/me', {
            headers: {
              'Authorization': `Bearer ${urlToken}`,
            },
          });
          
          if (response.ok) {
            const userData = await response.json();
            localStorage.setItem('user', JSON.stringify(userData));
            // Clear URL parameters and reload
            window.history.replaceState({}, document.title, '/onboarding');
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          // Continue with onboarding anyway
          setIsLoading(false);
          return;
        }
      }
      
      // Check if user is authenticated via localStorage
      const accessToken = localStorage.getItem('access_token');
      const userData = localStorage.getItem('user');
      
      if (!accessToken || !userData) {
        // Redirect to login if not authenticated
        navigate('/login');
        return;
      }
      
      // First check local storage to avoid unnecessary backend calls
      const localOnboardingCompleted = localStorage.getItem('onboarding_completed');
      if (localOnboardingCompleted === 'true') {
        console.log('Local storage shows onboarding completed, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
        return;
      }
      
      // Check if user has already completed onboarding by verifying with backend
      try {
        const response = await fetch('http://localhost:8000/auth/me', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (response.ok) {
          const userData = await response.json();
          console.log('Backend onboarding status:', userData.onboarding_completed);
          
          if (userData.onboarding_completed === true) {
            // Update local storage and redirect to dashboard
            localStorage.setItem('onboarding_completed', 'true');
            localStorage.setItem('user', JSON.stringify(userData));
            console.log('Redirecting to dashboard - onboarding completed');
            navigate('/dashboard', { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        // Continue with onboarding if we can't verify status
      }
      
      setIsLoading(false);
    };

    checkOnboardingStatus();
  }, [navigate, searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#110E0E] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading onboarding...</p>
        </div>
      </div>
    );
  }

  return <OnboardingWizard />;
};

export default OnboardingPage;
