import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const AuthErrorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const provider = searchParams.get('provider');
  const type = searchParams.get('type');
  const error = searchParams.get('error');

  useEffect(() => {
    console.log('AuthErrorPage loaded with provider:', provider, 'type:', type, 'error:', error);
    
    // Send error message to parent window
    if (window.opener) {
      console.log('Sending error message to parent window');
      try {
        window.opener.postMessage({
          type: `${provider?.toUpperCase()}_CONNECT_FAILED`,
          provider,
          connectionType: type,
          error: error || 'Unknown error'
        }, window.location.origin);
        
        // Close the popup window
        setTimeout(() => {
          console.log('Closing popup window');
          window.close();
        }, 2000);
      } catch (error) {
        console.error('Error sending message to parent:', error);
        // Fallback: redirect to realtime page with error
        setTimeout(() => {
          window.location.href = '/realtime?error=' + provider + '_connect_failed';
        }, 3000);
      }
    } else {
      // If not in a popup, redirect to the appropriate page
      console.log('Not in popup, redirecting to appropriate page');
      if (type === 'health_service') {
        window.location.href = '/realtime?error=' + provider + '_connect_failed';
      } else {
        window.location.href = '/signup?error=oauth_failed';
      }
    }
  }, [provider, type, error]);

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Connection Failed</h1>
        <p className="text-gray-400 mb-4">
          Failed to connect {provider === 'google' ? 'Google Fit' : provider}.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Error: {error || 'Unknown error'}
        </p>
        <p className="text-sm text-gray-500">This window will close automatically...</p>
      </div>
    </div>
  );
};

export default AuthErrorPage;
