import { useEffect, useState, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import MainLayout from '../components/ai_movement_analysis/MainLayout';
import { startCapture, stopCapture } from '../services/movementAnalysisService';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../config/api';

const PracticeRoom = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState({
    camera: 'Initializing',
    pose: 'Initializing',
    ai: 'Initializing'
  });

  // Check authentication and load user data
  useEffect(() => {
    const checkAuth = async () => {
      const accessToken = localStorage.getItem('access_token');
      const userData = localStorage.getItem('user');

      if (!accessToken || !userData) {
        navigate('/login');
        return;
      }

      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsLoading(false);
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        navigate('/login');
      }
    };

    checkAuth();
    
    // Load onboarding data for form users to get profile picture
    const loadOnboardingData = async () => {
      try {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) return;
        
        const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data?.step1) {
            setOnboardingStep1(data.step1);
          }
        }
      } catch (error) {
        console.error('Failed to load onboarding data:', error);
      }
    };
    
    loadOnboardingData();
  }, [navigate]);

  // Initialize capture system after authentication
  useEffect(() => {
    if (!user || isLoading) return;

    let isMounted = true;
    let startAttempts = 0;
    const MAX_START_ATTEMPTS = 3;

    // Start capture system when component mounts and user is authenticated
    const initializeCapture = async () => {
      while (startAttempts < MAX_START_ATTEMPTS && isMounted) {
        try {
          startAttempts++;
          console.log(`🚀 Starting capture system (attempt ${startAttempts}/${MAX_START_ATTEMPTS})...`);

          const result = await startCapture();
          console.log('✅ Capture system response:', result);

          if (isMounted) {
            // Update system status
            setSystemStatus({
              camera: 'Active',
              pose: 'Running',
              ai: 'Ready'
            });
            // Give it a moment to fully initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            setIsInitializing(false);
          }
          return; // Success, exit retry loop
        } catch (err) {
          console.error(`❌ Failed to start capture (attempt ${startAttempts}):`, err);

          if (startAttempts >= MAX_START_ATTEMPTS) {
            if (isMounted) {
              setError('Failed to initialize camera system after multiple attempts. Please check your camera permissions and refresh the page.');
              setIsInitializing(false);
            }
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    };

    initializeCapture();

    // Cleanup: Stop capture system when component unmounts
    return () => {
      isMounted = false;
      console.log('🛑 Stopping capture system...');

      // Use Promise with timeout to ensure cleanup doesn't hang
      const stopWithTimeout = Promise.race([
        stopCapture(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Stop timeout')), 5000)
        )
      ]);

      stopWithTimeout
        .then((result) => {
          console.log('✅ Capture system stopped:', result);
        })
        .catch((err) => {
          console.error('⚠️  Error stopping capture:', err);
          // Don't show error to user on unmount, but log it
        });
    };
  }, [user, isLoading]);

  const handleLogout = () => {
    // Clear all stored data
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');

    // Navigate to homepage
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#EB4747] mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <WebSocketProvider>
      <SettingsProvider>
        <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
          {/* Header (Same as Dashboard) */}
          <header className="w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
            <div className="max-w-[1920px] mx-auto px-10 h-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
                <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
                  <span className="text-white">Flux</span>
                  <span className="text-[#EB4747]">Well</span>
                </h2>
              </div>
              <nav className="hidden md:flex items-center gap-6 text-sm">
                <Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
                <Link to="/workouts" className="text-gray-400 hover:text-white">Workouts</Link>
                <Link to="/nutrition" className="text-gray-400 hover:text-white">Nutrition</Link>
                <Link to="/realtime" className="text-gray-400 hover:text-white">Tracking</Link>
                <Link to="/coach" className="text-gray-400 hover:text-white">Coach</Link>
                <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
                <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
                <Link to="/practice" className="text-[#EB4747] font-semibold">Practice Room</Link>
              </nav>
              <div className="flex items-center gap-3">
                <button onClick={handleLogout} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
                  {(() => {
                    const provider = user?.auth_provider;
                    const socialPic = (provider === 'google' || provider === 'fitbit') ? (user?.profile_picture_url || null) : null;
                    const formPic = provider === 'form' ? (onboardingStep1?.profile_picture_url || null) : null;
                    const src = socialPic || formPic;
                    if (src) return <img src={src} alt={user?.full_name || 'Profile'} className="w-full h-full object-cover" />;
                    return <span className="text-sm font-semibold">{user?.full_name?.[0] || 'U'}</span>;
                  })()}
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-[1440px] mx-auto px-6 md:px-10 pt-[73px] pb-10">
            {/* Welcome Section */}
            <div className="mt-8 mb-6">
              <h1 className="text-[36px] font-extrabold mb-2">Practice Room 🏋️‍♀️</h1>
              <p className="text-gray-400 text-lg">Welcome back, {user?.full_name?.split(' ')?.[0] || 'Athlete'}! Ready to perfect your form?</p>
            </div>

            {/* System Status Card */}
            <section className="w-full bg-gradient-to-br from-[#1E1E1E] to-[#2A1F1F] rounded-2xl shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] p-6 mb-6 border border-[#EB4747]/20">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#EB4747] to-[#b83232] flex items-center justify-center text-2xl shadow-lg shadow-[#EB4747]/30">
                  🤖
                </div>
                <div>
                  <h3 className="text-[20px] font-bold">AI Movement Analysis System</h3>
                  <p className="text-gray-400 text-sm">Real-time pose tracking and intelligent form correction</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-[#EB4747]/30 transition-all">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">📹</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Camera Feed</div>
                      <div className={`text-base font-bold ${systemStatus.camera === 'Active' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {systemStatus.camera}
                      </div>
                    </div>
                  </div>
                  <div className={`w-full h-1 rounded-full ${systemStatus.camera === 'Active' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                </div>

                <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-[#EB4747]/30 transition-all">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">🎯</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Pose Tracking</div>
                      <div className={`text-base font-bold ${systemStatus.pose === 'Running' ? 'text-blue-400' : 'text-yellow-400'}`}>
                        {systemStatus.pose}
                      </div>
                    </div>
                  </div>
                  <div className={`w-full h-1 rounded-full ${systemStatus.pose === 'Running' ? 'bg-blue-500' : 'bg-yellow-500'}`}></div>
                </div>

                <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-[#EB4747]/30 transition-all">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">🧠</div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 uppercase tracking-wider">AI Coach</div>
                      <div className={`text-base font-bold ${systemStatus.ai === 'Ready' ? 'text-[#EB4747]' : 'text-yellow-400'}`}>
                        {systemStatus.ai}
                      </div>
                    </div>
                  </div>
                  <div className={`w-full h-1 rounded-full ${systemStatus.ai === 'Ready' ? 'bg-[#EB4747]' : 'bg-yellow-500'}`}></div>
                </div>
              </div>
            </section>

            {/* AI Movement Analysis Interface */}
            <div className="relative bg-[#1E1E1E] rounded-2xl shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] overflow-hidden">
              {/* Initialization Overlay */}
              {isInitializing && (
                <div className="absolute inset-0 bg-[#1E1E1E] bg-opacity-95 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
                  <div className="text-center max-w-md mx-4">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-[#EB4747]/20"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#EB4747] animate-spin"></div>
                      <div className="absolute inset-2 rounded-full bg-[#EB4747]/10 flex items-center justify-center">
                        <span className="text-2xl">🤖</span>
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Initializing AI System</h3>
                    <p className="text-gray-400 text-sm">Starting camera feed and pose detection engine...</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-[#EB4747] rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-[#EB4747] rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-[#EB4747] rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Overlay */}
              {error && (
                <div className="absolute inset-0 bg-[#1E1E1E] bg-opacity-95 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
                  <div className="bg-gradient-to-br from-red-900/20 to-[#1a1a1a] border-2 border-red-500/50 rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
                    <div className="text-7xl mb-4 animate-pulse">⚠️</div>
                    <h3 className="text-2xl font-bold mb-3 text-red-400">Camera System Error</h3>
                    <p className="text-gray-300 mb-6 text-sm leading-relaxed">{error}</p>
                    <div className="space-y-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="w-full bg-gradient-to-r from-[#EB4747] to-[#d13f3f] hover:from-[#d13f3f] hover:to-[#b83232] text-white px-6 py-3 rounded-lg font-bold transition-all shadow-lg hover:shadow-xl"
                      >
                        🔄 Reload Page
                      </button>
                      <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full bg-white/5 hover:bg-white/10 border border-white/20 text-gray-300 px-6 py-3 rounded-lg font-medium transition-all"
                      >
                        ← Back to Dashboard
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main AI Movement Analysis Layout */}
              <div className="relative p-6">
                <MainLayout />
              </div>
            </div>

            {/* Quick Tips Grid */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Getting Started */}
              <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] border border-white/5 hover:border-[#EB4747]/20 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#EB4747]/10 flex items-center justify-center text-xl">
                    🎯
                  </div>
                  <h3 className="text-lg font-bold">Getting Started</h3>
                </div>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="text-[#EB4747] mt-0.5">•</span>
                    <span>Position yourself <strong className="text-white">6-8 feet</strong> from the camera for optimal tracking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#EB4747] mt-0.5">•</span>
                    <span>Ensure <strong className="text-white">good lighting</strong> - natural light works best</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#EB4747] mt-0.5">•</span>
                    <span>Wear <strong className="text-white">fitted clothing</strong> for accurate pose detection</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#EB4747] mt-0.5">•</span>
                    <span>Clear the area of obstacles for safe movement</span>
                  </li>
                </ul>
              </section>

              {/* Understanding Feedback */}
              <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] border border-white/5 hover:border-[#EB4747]/20 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#EB4747]/10 flex items-center justify-center text-xl">
                    📊
                  </div>
                  <h3 className="text-lg font-bold">Understanding AI Feedback</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">✓</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-green-400">Good Form</div>
                      <div className="text-xs text-gray-400">Keep it up! Your posture is on point</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm">!</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-400">Needs Correction</div>
                      <div className="text-xs text-gray-400">Adjust your form based on AI guidance</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">#</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-blue-400">Rep Counter</div>
                      <div className="text-xs text-gray-400">Automatic tracking of your progress</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Pro Tips Banner */}
            <section className="mt-6 bg-gradient-to-r from-[#EB4747]/10 via-[#1E1E1E] to-[#EB4747]/10 rounded-2xl p-6 border border-[#EB4747]/20 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <div className="flex items-start gap-4">
                <div className="text-4xl">💡</div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-2 text-[#EB4747]">Pro Tip</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    For best results, start with slower movements to let the AI learn your form. 
                    Once tracking is stable, you can increase your pace. The system continuously adapts to your movement patterns!
                  </p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </SettingsProvider>
    </WebSocketProvider>
  );
};

export default PracticeRoom;

