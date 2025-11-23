import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const AuthSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const provider = searchParams.get('provider');
  const type = searchParams.get('type');

  useEffect(() => {
    console.log('AuthSuccessPage loaded with provider:', provider, 'type:', type);
    
    // Send success message to parent window
    if (window.opener) {
      console.log('Sending message to parent window');
      try {
        window.opener.postMessage({
          type: `${provider?.toUpperCase()}_CONNECTED`,
          provider,
          connectionType: type
        }, window.location.origin);
        
        // Close the popup window
        setTimeout(() => {
          console.log('Closing popup window');
          window.close();
        }, 1000);
      } catch (error) {
        console.error('Error sending message to parent:', error);
        // Fallback: redirect to realtime page
        setTimeout(() => {
          window.location.href = '/realtime?connected=' + provider;
        }, 2000);
      }
    } else {
      // If not in a popup, redirect to the appropriate page
      console.log('Not in popup, redirecting to appropriate page');
      if (type === 'health_service') {
        window.location.href = '/realtime?connected=' + provider;
      } else {
        window.location.href = '/dashboard';
      }
    }
  }, [provider, type]);

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Connection Successful!</h1>
        <p className="text-gray-400 mb-4">
          {provider === 'google' ? 'Google Fit' : provider} has been connected successfully.
        </p>
        <p className="text-sm text-gray-500">This window will close automatically...</p>
      </div>
    </div>
  );
};

export default AuthSuccessPage;
