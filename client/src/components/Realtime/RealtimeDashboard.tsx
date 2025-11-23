import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../../config/api';

interface HealthMetric {
  value: string;
  unit: string;
  change: string;
  changeType: 'positive' | 'negative';
}

const RealtimeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    heartRate: { value: '88', unit: 'bpm', change: '+2%', changeType: 'positive' as const },
    steps: { value: '6,254', unit: '', change: '+5%', changeType: 'positive' as const },
    sleep: { value: '6h 45m', unit: '', change: '-10%', changeType: 'negative' as const },
    calories: { value: '1,890', unit: 'kcal', change: '+3%', changeType: 'positive' as const },
    distance: { value: '4.2', unit: 'km', change: '+8%', changeType: 'positive' as const },
    bloodPressure: { value: '120/80', unit: 'mmHg', change: '-3%', changeType: 'positive' as const },
    bloodGlucose: { value: '95', unit: 'mg/dL', change: '+1%', changeType: 'positive' as const },
    oxygenSaturation: { value: '98', unit: '%', change: '+0%', changeType: 'positive' as const },
    bodyTemperature: { value: '98.6', unit: '°F', change: '+0.2%', changeType: 'positive' as const }
  });

  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<string | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [showConnectionSuccess, setShowConnectionSuccess] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState("");
  const [aiAnalyses, setAiAnalyses] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [hasCriticalAlerts, setHasCriticalAlerts] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);

  // Load user and onboarding data
  useEffect(() => {
    const storedUser = (() => {
      try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();
    if (storedUser) {
      setUser(storedUser);
    }
    
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
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    navigate('/');
  };

  const fetchAiSuggestions = async () => {
    try {
      const userToken = localStorage.getItem('access_token');
      if (!userToken) {
        console.error('No access token found for AI suggestions');
        return;
      }

      setIsLoadingSuggestions(true);
      setSuggestionsError(null);

      const response = await fetch('/api/ai/realtime/suggestions', {
        headers: { 
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`AI suggestions failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('🤖 AI Suggestions received:', data);
      
      setAiSuggestions(data.summary || '');
      setAiAnalyses(data.analyses || []);
      
      // Check for critical alerts
      const criticalIssues = data.analyses?.filter((analysis: any) => analysis.severity === 'critical') || [];
      setHasCriticalAlerts(criticalIssues.length > 0);
      
      // Auto-show AI panel if there are critical alerts
      if (criticalIssues.length > 0) {
        setShowAiPanel(true);
      }
      
      if (data.error) {
        setSuggestionsError(data.error);
      }
    } catch (error) {
      console.error('❌ Error fetching AI suggestions:', error);
      setSuggestionsError(`Failed to load AI suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleGoogleFitConnect = async () => {
    try {
      const userToken = localStorage.getItem('access_token');
      if (!userToken) {
        console.error('No access token found');
        return;
      }

      console.log('🔐 Attempting Google Fit connection with token:', userToken.substring(0, 20) + '...');

      const response = await fetch('/auth/connect-health-service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ provider: 'google' })
      });

      console.log('📡 Google Fit connection response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Google Fit connection failed:', errorText);
        throw new Error('Failed to initiate Google Fit connection');
      }

      const data = await response.json();
      const url = data.redirect_url as string;
      if (!url) {
        console.error('Missing redirect_url');
        return;
      }

      // Open the OAuth URL in a popup window (ensure absolute URL)
      const popup = window.open(
        url.startsWith('http') ? url : new URL(url, window.location.origin).toString(),
        'googleFitAuth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        console.error('Failed to open popup window. Please allow popups for this site.');
        return;
      }
      
      // Listen for messages from the popup window
      const handleMessage = (event: MessageEvent) => {
        // Verify the message is from our popup
        if (event.origin !== window.location.origin) {
          return;
        }
        
        if (event.data.type === 'GOOGLE_FIT_CONNECTED') {
          console.log('✅ Google Fit connection successful');
          // Close the popup
          popup.close();
          // Remove the event listener
          window.removeEventListener('message', handleMessage);
          // Show success message and refresh connection status
          setShowConnectionSuccess(true);
          setTimeout(() => {
            setShowConnectionSuccess(false);
            window.location.reload();
          }, 2000);
        } else if (event.data.type === 'GOOGLE_FIT_CONNECT_FAILED') {
          console.error('❌ Google Fit connection failed:', event.data.error);
          // Close the popup
          popup.close();
          // Remove the event listener
          window.removeEventListener('message', handleMessage);
          // Show error message
          setError('Google Fit connection failed. Please try again.');
        }
      };
      
      // Add event listener for messages from popup
      window.addEventListener('message', handleMessage);
      
      // Fallback: Listen for popup to close and check if authentication was successful
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          // Remove the message event listener
          window.removeEventListener('message', handleMessage);
          // Check if we have a success message in the URL (fallback)
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('connected') === 'google') {
            console.log('✅ Google Fit connection successful (fallback detection)');
            window.location.reload();
          } else if (urlParams.get('error') === 'google_connect_failed') {
            console.error('❌ Google Fit connection failed (fallback detection)');
            setError('Google Fit connection failed. Please try again.');
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Error connecting to Google Fit:', error);
    }
  };


  // Check for URL parameters on component mount (fallback for popup communication)
  useEffect(() => {
          const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connected') === 'google') {
      console.log('✅ Google Fit connection successful (URL parameter detection)');
      // Clear the URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
      // Reload to refresh the connection status
            window.location.reload();
    } else if (urlParams.get('error') === 'google_connect_failed') {
      console.error('❌ Google Fit connection failed (URL parameter detection)');
      setError('Google Fit connection failed. Please try again.');
      // Clear the URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Sequential real-time data fetching with progressive updates
  useEffect(() => {
    let isFetching = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let isActive = true;

    const startPolling = async () => {
      const userToken = localStorage.getItem('access_token');
      if (!userToken) {
        setError('No access token found');
        setIsConnected(false);
        return;
      }

      // Check connection status first
      try {
        const st = await fetch('/api/realtime/status', {
          headers: { 'Authorization': `Bearer ${userToken}` }
        });
        if (st.ok) {
          const j = await st.json();
          console.log('🔍 Connection status:', j);
          setIsConnected(!!j.connected);
          setConnectedProvider(j.provider || null);
          setIsCheckingConnection(false);
          if (!j.connected) {
            console.log('❌ User not connected to health service, not starting polling');
            // Do not start polling for form users until connected
            return;
          }
          console.log('✅ User connected to health service, starting polling');
          // Fetch AI suggestions when connected
          fetchAiSuggestions();
        } else {
          // On error, be safe and do not start polling
          setIsConnected(false);
          setIsCheckingConnection(false);
          return;
        }
      } catch (e) {
        setIsConnected(false);
        setIsCheckingConnection(false);
        return;
      }

      const fetchMetrics = async () => {
        if (isFetching || !isActive) {
          return;
        }
        try {
          isFetching = true;
          setIsUpdating(true);
          setError(null);

          const res = await fetch('/api/realtime/metrics', {
            headers: { 'Authorization': `Bearer ${userToken}` },
            signal: AbortSignal.timeout(20000)
          });

          if (!res.ok) {
            if (res.status === 400) {
              setError('Please connect a health service to view real-time data');
              return;
            }
            const errorText = await res.text();
            console.error('❌ Failed to fetch metrics:', res.status, errorText);
            setError(`Failed to fetch metrics: ${res.status}`);
            return;
          }

          const data = await res.json();

          // Transform and set metrics
          const formatValue = (value: any, isNumber: boolean = true) => {
            if (value === null || value === undefined || value === '') return '0';
            if (isNumber) {
              const num = typeof value === 'string' ? parseFloat(value) : value;
              return isNaN(num) ? '0' : num.toString();
            }
            return value.toString();
          };
          const formatNumber = (value: any) => {
            const num = typeof value === 'string' ? parseFloat(value) : value;
            return isNaN(num) ? 0 : num;
          };

          // Compact formatter for large numbers (e.g., 12.3K)
          const formatCompact = (num: number) => {
            try {
              return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(num);
            } catch {
              // Fallback if Intl not available
              if (num >= 1_000_000) return `${Math.round(num / 100_000) / 10}M`;
              if (num >= 1_000) return `${Math.round(num / 100) / 10}K`;
              return num.toLocaleString();
            }
          };

          const formatDistance = (value: any) => {
            const num = formatNumber(value);
            if (num >= 100) return Math.round(num).toString();
            if (num >= 10) return num.toFixed(1);
            return num.toFixed(2);
          };

          // Pre-format values with overflow-safe number formatting
          const stepsNum = formatNumber(data.steps);
          const caloriesNum = formatNumber(data.calories);

          setMetrics({
            heartRate: { value: formatValue(data.heart_rate), unit: 'bpm', change: '+2%', changeType: 'positive' },
            steps: { value: stepsNum >= 10000 ? formatCompact(stepsNum) : stepsNum.toLocaleString(), unit: '', change: '+5%', changeType: 'positive' },
            sleep: { value: data.sleep || '6h 45m', unit: '', change: '-10%', changeType: 'negative' },
            calories: { value: caloriesNum >= 10000 ? formatCompact(caloriesNum) : caloriesNum.toLocaleString(), unit: 'kcal', change: '+3%', changeType: 'positive' },
            distance: { value: formatDistance(data.distance), unit: 'm', change: '+8%', changeType: 'positive' },
            bloodPressure: { value: data.blood_pressure || '120/80', unit: 'mmHg', change: '-3%', changeType: 'positive' },
            bloodGlucose: { value: formatValue(data.blood_glucose), unit: 'mg/dL', change: '+1%', changeType: 'positive' },
            oxygenSaturation: { value: formatValue(data.oxygen_saturation), unit: '%', change: '+0%', changeType: 'positive' },
            bodyTemperature: { value: formatValue(data.body_temperature), unit: '°F', change: '+0.2%', changeType: 'positive' },
          });
          setLastUpdate(new Date());
          setError(null);

          // Fetch AI suggestions every 30 seconds (less frequent than metrics)
          if (isActive && Math.random() < 0.1) { // 10% chance every 10 seconds = ~30 seconds average
            fetchAiSuggestions();
          }

          if (isActive) {
            timeoutId = setTimeout(() => {
              if (isActive) fetchMetrics();
            }, 10000);
          }
        } catch (error: any) {
          if (isActive) {
            timeoutId = setTimeout(() => {
              if (isActive) fetchMetrics();
            }, 15000);
          }
        } finally {
          isFetching = false;
          setIsUpdating(false);
        }
      };

      // Kick off polling only if connected
      await fetchMetrics();
    };

    // Initial gate + possible start
    startPolling();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Critical Alert Banner Component
  const CriticalAlertBanner: React.FC = () => {
    if (!hasCriticalAlerts || !aiSuggestions) return null;
    
    return (
      <div className="fixed top-[73px] left-0 right-0 z-50 bg-gradient-to-r from-[#EF4444] to-[#DC2626] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-sm">🚨 CRITICAL HEALTH ALERT</h3>
                <p className="text-xs opacity-90">{aiSuggestions}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAiPanel(true)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    );
  };

  // AI Insights Panel Component
  const AIInsightsPanel: React.FC = () => {
    if (!isConnected) return null;

    // Close on ESC key
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && showAiPanel) {
          setShowAiPanel(false);
        }
      };
      window.addEventListener('keydown', onKeyDown as any);
      return () => window.removeEventListener('keydown', onKeyDown as any);
    }, [showAiPanel]);
    
    return (
      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-[#1F2937] border-l border-[#374151] shadow-2xl transform transition-transform duration-300 z-[60] ${
        showAiPanel ? 'translate-x-0' : 'translate-x-full'
      }`} role="dialog" aria-modal="true" aria-label="AI Health Insights">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[#374151] bg-[#111827]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white">AI Health Insights</h3>
              </div>
              <button
                onClick={() => setShowAiPanel(false)}
                aria-label="Close AI insights"
                className="w-8 h-8 bg-[#374151] hover:bg-[#4B5563] rounded-lg flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {suggestionsError ? (
              <div className="p-4 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg">
                <p className="text-[#EF4444] text-sm">{suggestionsError}</p>
                <button 
                  onClick={fetchAiSuggestions}
                  className="mt-2 px-3 py-1 bg-[#EF4444] text-white text-xs rounded hover:bg-[#DC2626] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : aiSuggestions ? (
              <div className="space-y-4">
                <div className="p-4 bg-[#1F2937]/50 border border-[#374151]/50 rounded-lg">
                  <p className="text-white text-sm leading-relaxed">{aiSuggestions}</p>
                </div>
                
                {aiAnalyses.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wide">Detailed Analysis</h4>
                    <div className="space-y-2">
                      {aiAnalyses.map((analysis, index) => (
                        <div 
                          key={index}
                          className={`p-3 rounded-lg border ${
                            analysis.severity === 'critical' 
                              ? 'bg-[#EF4444]/10 border-[#EF4444]/20' 
                              : analysis.severity === 'warning'
                              ? 'bg-[#F59E0B]/10 border-[#F59E0B]/20'
                              : 'bg-[#10B981]/10 border-[#10B981]/20'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full mt-2 ${
                              analysis.severity === 'critical' 
                                ? 'bg-[#EF4444]' 
                                : analysis.severity === 'warning'
                                ? 'bg-[#F59E0B]'
                                : 'bg-[#10B981]'
                            }`}></div>
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${
                                analysis.severity === 'critical' 
                                  ? 'text-[#EF4444]' 
                                  : analysis.severity === 'warning'
                                  ? 'text-[#F59E0B]'
                                  : 'text-[#10B981]'
                              }`}>
                                {analysis.message}
                              </p>
                              <p className="text-xs text-[#9CA3AF] mt-1">{analysis.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-[#374151]/30 border border-[#4B5563]/50 rounded-lg">
                <p className="text-[#9CA3AF] text-sm">AI is analyzing your health data...</p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="p-4 border-t border-[#374151] bg-[#111827]">
            <button 
              onClick={fetchAiSuggestions}
              disabled={isLoadingSuggestions}
              className="w-full px-4 py-2 bg-[#10B981] text-white text-sm rounded-lg hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoadingSuggestions ? 'Analyzing...' : 'Refresh Analysis'}
            </button>
            <p className="text-xs text-[#6B7280] text-center mt-2">Updated every 30 seconds</p>
          </div>
        </div>
      </div>
    );
  };

  const MetricCard: React.FC<{
    title: string;
    emoji: string;
    metric: HealthMetric;
    trendIcon: React.ReactNode;
  }> = ({ title, emoji, metric, trendIcon }) => (
    <div className="w-full md:w-full bg-[#111827] border border-[#1F2937] rounded-xl p-6 flex flex-col hover:border-[#374151] transition-all duration-300 hover:shadow-lg hover:shadow-black/20 group min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-white/90 group-hover:text-white transition-colors">{title}</h3>
        <div className="text-3xl group-hover:scale-110 transition-transform duration-300">
          {emoji}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div className="flex items-baseline gap-2 mb-5 min-w-0">
          <span className="text-3xl font-bold text-white group-hover:text-white transition-colors truncate max-w-[9ch] sm:max-w-[12ch]">{metric.value}</span>
          {metric.unit && (
            <span className="text-base text-[#9CA3AF] group-hover:text-[#D1D5DB] transition-colors shrink-0">{metric.unit}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 flex items-center justify-center">
            {trendIcon}
          </div>
          <span className={`text-sm font-medium ${
            metric.changeType === 'positive' ? 'text-[#10B981]' : 'text-[#F59E0B]'
          } group-hover:opacity-90 transition-opacity`}>
            {metric.change}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Critical Alert Banner */}
      <CriticalAlertBanner />
      
      {/* AI Insights Panel */}
      <AIInsightsPanel />
      
      {/* Header (same as Dashboard) */}
      <header className={`w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40 ${showAiPanel ? 'md:pr-96' : ''}`}>
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
            <Link to="/realtime" className="text-[#EB4747] font-semibold">Tracking</Link>
            <Link to="/coach" className="text-gray-400 hover:text-white">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
            <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
            <Link to="/practice" className="text-gray-400 hover:text-white">Practice Room</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {(() => {
                const provider = (user as any)?.auth_provider;
                const socialPic = (provider === 'google' || provider === 'fitbit') ? ((user as any)?.profile_picture_url || null) : null;
                const formPic = provider === 'form' ? (onboardingStep1 as any)?.profile_picture_url || null : null;
                const src = socialPic || formPic;
                if (src) return <img src={src} alt={(user as any)?.full_name || 'Profile'} className="w-full h-full object-cover" />;
                return <span className="text-sm font-semibold">{(user as any)?.full_name?.[0] || 'U'}</span>;
              })()}
            </div>
          </div>
        </div>
      </header>

      {/* Gradient background layer */}
      <div className="fixed inset-0 -z-10" aria-hidden>
        <div className="w-full h-full" style={{
          background: 'linear-gradient(159deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(71,36,38,0.5) 100%)'
        }} />
      </div>

      {/* Main Content */}
      <main className={`max-w-[1440px] mx-auto px-6 md:px-10 pb-16 min-h-screen ${
        hasCriticalAlerts ? 'pt-[140px]' : 'pt-[93px]'
      } ${showAiPanel ? 'md:mr-96' : ''}`}>
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#1F2937]/50 px-4 py-2 rounded-full mb-6">
            <div className={`w-2 h-2 rounded-full ${
              isUpdating ? 'bg-[#F59E0B] animate-pulse' : error ? 'bg-[#EF4444]' : 'bg-[#10B981]'
            }`}></div>
            <span className="text-sm text-[#9CA3AF] font-medium">
              {isUpdating ? 'Updating...' : error ? 'Error' : 'Live Data'}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Your Health Metrics</h1>
          <p className="text-lg text-[#9CA3AF] max-w-2xl mx-auto leading-relaxed">
            Real-time health tracking with fresh data updates every 10 seconds
          </p>
          {error && (
            <div className="mt-4 p-4 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg max-w-md mx-auto">
              <p className="text-[#EF4444] text-sm">{error}</p>
            </div>
          )}
          {showConnectionSuccess && (
            <div className="mt-4 p-4 bg-[#10B981]/10 border border-[#10B981]/20 rounded-lg max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[#10B981] text-sm font-medium">Google Fit connected successfully! Loading your data...</p>
              </div>
            </div>
          )}
        </div>

        {/* Show Health Service Connection Card for unconnected users, Metrics for connected users */}
        {(() => {
          console.log('🎯 Rendering decision - isCheckingConnection:', isCheckingConnection, 'isConnected:', isConnected, 'connectedProvider:', connectedProvider);
          return null;
        })()}
        {isCheckingConnection ? (
          /* Loading state while checking connection */
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-[#1F2937] to-[#111827] border border-[#374151] rounded-2xl p-8 shadow-xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-[#374151] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <div className="w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Checking Connection...</h2>
                <p className="text-[#9CA3AF] text-lg">Please wait while we verify your health service connection</p>
              </div>
            </div>
          </div>
        ) : !isConnected ? (
          /* Health Service Connection Card - Main content for unconnected users */
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-[#1F2937] to-[#111827] border border-[#374151] rounded-2xl p-8 shadow-xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-3">Connect a Health Service</h2>
                <p className="text-[#9CA3AF] text-lg">Choose how you want to track your health data</p>
              </div>
              
              <div className="flex justify-center">
                {/* Google Fit Button - Centered */}
                <button 
                  onClick={handleGoogleFitConnect}
                  className="group bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl p-8 transition-all duration-300 hover:shadow-lg hover:scale-105 max-w-md w-full"
                >
                  <div className="flex items-center justify-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="text-xl font-semibold text-gray-900 group-hover:text-gray-700">Connect Google Fit</div>
                      <div className="text-base text-gray-500 group-hover:text-gray-600">Sync your fitness and health data</div>
                      <div className="text-sm text-gray-400 mt-1">Steps, heart rate, sleep, and more</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Metrics Grid - For connected users */
          <>
            {/* Quick AI Summary Card */}
            {aiSuggestions && (
              <div className="max-w-4xl mx-auto mb-8">
                <div className={`p-4 rounded-xl border ${
                  hasCriticalAlerts 
                    ? 'bg-[#EF4444]/10 border-[#EF4444]/20' 
                    : 'bg-[#10B981]/10 border-[#10B981]/20'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      hasCriticalAlerts ? 'bg-[#EF4444] animate-pulse' : 'bg-[#10B981]'
                    }`}></div>
                    <p className={`text-sm font-medium ${
                      hasCriticalAlerts ? 'text-[#EF4444]' : 'text-[#10B981]'
                    }`}>
                      {aiSuggestions}
                    </p>
                    <button
                      onClick={() => setShowAiPanel(true)}
                      className="ml-auto px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mx-auto ${
              showAiPanel ? 'max-w-5xl' : 'max-w-7xl'
            }`}>
              <MetricCard
                title="Heart Rate"
                emoji="❤️"
                metric={metrics.heartRate}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Steps Today"
                emoji="🚶"
                metric={metrics.steps}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Sleep Duration"
                emoji="😴"
                metric={metrics.sleep}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6L7 10L11 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 2V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Calories"
                emoji="🔥"
                metric={metrics.calories}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Distance"
                emoji="🏃"
                metric={metrics.distance}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Blood Pressure"
                emoji="🩸"
                metric={metrics.bloodPressure}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6L7 10L11 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 2V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Blood Glucose"
                emoji="🍯"
                metric={metrics.bloodGlucose}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Oxygen Saturation"
                emoji="🫁"
                metric={metrics.oxygenSaturation}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
              
              <MetricCard
                title="Body Temperature"
                emoji="🌡️"
                metric={metrics.bodyTemperature}
                trendIcon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 10L7 6L11 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 6V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                }
              />
            </div>


            {/* Last Update Info - Only for connected users */}
            <div className="text-center mt-16">
              <div className="inline-flex items-center gap-3 bg-[#1F2937]/30 px-6 py-3 rounded-full border border-[#374151]/50">
                <div className={`w-2 h-2 rounded-full ${
                  isUpdating ? 'bg-[#F59E0B] animate-pulse' : 
                  error ? 'bg-[#EF4444]' : 
                  'bg-[#10B981]'
                }`}></div>
                <span className="text-sm text-[#9CA3AF] font-medium">
                  {isUpdating ? 'Updating...' : `Last updated: ${lastUpdate.toLocaleTimeString()}`}
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Floating AI Button - Only for connected users */}
      {isConnected && (
        <div className="fixed bottom-6 right-6 z-30">
          <button
            onClick={() => setShowAiPanel(true)}
            aria-label="Open AI Health Insights"
            className={`group relative w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:scale-110 ${
              hasCriticalAlerts 
                ? 'bg-gradient-to-r from-[#EF4444] to-[#DC2626] animate-pulse' 
                : 'bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857]'
            }`}
          >
            <div className="flex items-center justify-center w-full h-full">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            
            {/* Notification Badge */}
            {hasCriticalAlerts && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#EF4444] rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">!</span>
              </div>
            )}
            
            {/* Loading Indicator */}
            {isLoadingSuggestions && (
              <div className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
            )}
            
            {/* Tooltip */}
            <div className="absolute right-16 top-1/2 transform -translate-y-1/2 bg-[#1F2937] text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
              {hasCriticalAlerts ? 'Critical Health Alert' : 'AI Health Insights'}
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-4 border-l-[#1F2937] border-t-4 border-t-transparent border-b-4 border-b-transparent"></div>
            </div>
          </button>
        </div>
      )}

      {/* Backdrop for mobile AI panel */}
      {showAiPanel && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setShowAiPanel(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default RealtimeDashboard;
