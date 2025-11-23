import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import logoIcon from '../assets/images/logo-icon.svg';
import { dashboardService, type DashboardMetrics, type StreakData, type MacrosToday, type RealtimeData, type WorkoutSummary } from '../services/dashboardService';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiAssessment, setAiAssessment] = useState<{
    time_to_goal: string;
    motivational_message: string;
    health_score: number;
    risk_profile: string[];
    predicted_calories?: number;  // AI-predicted daily calorie needs
    generated_at?: string;
  } | null>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<{ height?: string; weight?: string; date_of_birth?: string; gender?: string; profile_picture_url?: string } | null>(null);
  const [onboardingStep2, setOnboardingStep2] = useState<{ fitness_goals?: string[]; activity_level?: string } | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  
  // Dashboard data state
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [macrosToday, setMacrosToday] = useState<MacrosToday | null>(null);
  const [realtimeData, setRealtimeData] = useState<RealtimeData | null>(null);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Helpers: parsing and calculations
  const parseHeightToMeters = (heightStr?: string | null): number | null => {
    if (!heightStr) return null;
    const s = String(heightStr).trim().toLowerCase();
    // Try centimeters (e.g., "180", "180 cm")
    const cmMatch = s.match(/([0-9]+\.?[0-9]*)\s*cm/);
    if (cmMatch) {
      const cm = parseFloat(cmMatch[1]);
      if (!isNaN(cm) && cm > 0) return cm / 100;
    }
    if (/^[0-9]+\.?[0-9]*$/.test(s)) {
      const cm = parseFloat(s);
      if (!isNaN(cm) && cm > 3) return cm / 100; // treat as cm if plausible
    }
    // Try feet/inches (e.g., 5'10", 5ft 10in)
    const ftInMatch = s.match(/([0-9]+)\s*(ft|')\s*([0-9]+)?\s*(in|"|inches)?/);
    if (ftInMatch) {
      const ft = parseFloat(ftInMatch[1] || '0');
      const inch = parseFloat(ftInMatch[3] || '0');
      const totalInches = ft * 12 + inch;
      const meters = totalInches * 0.0254;
      if (!isNaN(meters) && meters > 0.3) return meters;
    }
    return null;
  };

  const parseWeightToKg = (weightStr?: string | number | null): number | null => {
    if (weightStr === null || weightStr === undefined) return null;
    const s = String(weightStr).trim().toLowerCase();
    // lbs
    const lbMatch = s.match(/([0-9]+\.?[0-9]*)\s*(lb|lbs|pound|pounds)/);
    if (lbMatch) {
      const lb = parseFloat(lbMatch[1]);
      if (!isNaN(lb)) return lb * 0.45359237;
    }
    // kg
    const kgMatch = s.match(/([0-9]+\.?[0-9]*)\s*(kg|kgs|kilogram|kilograms)/);
    if (kgMatch) {
      const kg = parseFloat(kgMatch[1]);
      if (!isNaN(kg)) return kg;
    }
    // Just a number: assume kg
    if (/^[0-9]+\.?[0-9]*$/.test(s)) {
      const kg = parseFloat(s);
      if (!isNaN(kg)) return kg;
    }
    return null;
  };

  const calculateAge = (dobStr?: string | null): number | null => {
    if (!dobStr) return null;
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  const getActivityFactor = (level?: string | null): number => {
    if (!level) return 1.2;
    const s = level.toLowerCase();
    if (s.includes('sedentary')) return 1.2;
    if (s.includes('light')) return 1.375;
    if (s.includes('moderate')) return 1.55;
    if (s.includes('very') || s.includes('active')) return 1.725;
    if (s.includes('extra') || s.includes('athlete')) return 1.9;
    return 1.2;
  };

  const { bmiValue, bmiDisplay, tdeeDisplay, caloriesValue } = useMemo(() => {
    const heightM = parseHeightToMeters(onboardingStep1?.height || (user as any)?.height || undefined);
    const weightKg = parseWeightToKg(onboardingStep1?.weight || (user as any)?.weight || undefined);
    const gender = (onboardingStep1?.gender || user?.gender || '').toLowerCase();
    const age = calculateAge(onboardingStep1?.date_of_birth || user?.date_of_birth || undefined);
    const activity = getActivityFactor(onboardingStep2?.activity_level);

    let bmi: number | null = null;
    if (heightM && weightKg) {
      bmi = weightKg / (heightM * heightM);
    }

    // Prioritize AI-predicted calories over calculated TDEE
    let calories: number | null = null;
    
    if (aiAssessment?.predicted_calories) {
      // Use AI-predicted calories (most accurate, considers goals and medical conditions)
      calories = aiAssessment.predicted_calories;
    } else if (weightKg && heightM) {
      // Fallback: Calculate TDEE using Mifflin-St Jeor equation
      const heightCm = heightM * 100;
      const ageValue = (age === null || isNaN(age)) ? 30 : age;
      let bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageValue;
      if (gender === 'male' || gender === 'm') bmr += 5;
      else if (gender === 'female' || gender === 'f') bmr -= 161;
      calories = Math.round(bmr * activity);
    }

    return {
      bmiValue: bmi,
      bmiDisplay: bmi ? bmi.toFixed(1) : '—',
      tdeeDisplay: calories ? `${calories} kcal` : '—',
      caloriesValue: calories, // Actual numeric value for nutrition module
    };
  }, [onboardingStep1, onboardingStep2, user, aiAssessment]);

  // Load dashboard data function
  const loadDashboardData = async () => {
    setDashboardLoading(true);
    try {
      const data = await dashboardService.getAllDashboardData();
      setDashboardMetrics(data.metrics);
      setStreakData(data.streak);
      setMacrosToday(data.macros);
      setRealtimeData(data.realtime);
      setWorkoutSummary(data.workout);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const loadOnboardingData = async (token: string, currentUser: any) => {
        try {
          const resp = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.ai_assessment) setAiAssessment(data.ai_assessment);
            if (data?.step1) setOnboardingStep1(data.step1);
            if (data?.step2) setOnboardingStep2(data.step2);
          }
        } catch (e) {
          console.error('Failed loading onboarding data', e);
        }
      };
      // Check if token is passed via URL (from OAuth callback)
      const urlToken = searchParams.get('token');
      
      if (urlToken) {
        // Store the token and fetch user data
        localStorage.setItem('access_token', urlToken);
        
        try {
          const response = await fetch(API_ENDPOINTS.AUTH.ME, {
            headers: {
              'Authorization': `Bearer ${urlToken}`,
            },
          });
          
          if (response.ok) {
            const userData = await response.json();
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
            // Clear URL parameters
            window.history.replaceState({}, document.title, '/dashboard');
            await loadOnboardingData(urlToken, userData);
            
            // Load dashboard data
            await loadDashboardData();
            
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
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
      
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        
        // First check local storage to avoid unnecessary backend calls
        const localOnboardingCompleted = localStorage.getItem('onboarding_completed');
        if (localOnboardingCompleted === 'true') {
          console.log('Local storage shows onboarding completed, proceeding to dashboard');
          await loadOnboardingData(accessToken, parsedUser);
          
          // Load dashboard data
          await loadDashboardData();
          
          setIsLoading(false);
          return;
        }
        
        // Verify onboarding status with backend
        const response = await fetch(API_ENDPOINTS.AUTH.ME, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        
        // Check onboarding completion status from backend user data
        const backendUserData = await response.json();
        const hasOnboardingData = backendUserData.onboarding_completed;
        // reduce console noise
        
        if (hasOnboardingData !== true) {
          // Redirect to onboarding for users who haven't completed it
          console.log('Redirecting to onboarding - not completed');
          navigate('/onboarding', { replace: true });
          return;
        }
        
        // Update local storage to match backend status
        localStorage.setItem('onboarding_completed', 'true');
        console.log('Dashboard access granted - onboarding completed');
        setUser(backendUserData);
        await loadOnboardingData(accessToken, backendUserData);
        
        // Load dashboard data
        await loadDashboardData();
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error parsing user data:', error);
        // Clear invalid data and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate, searchParams]);

  const handleLogout = () => {
    // Clear all stored data
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    
    // Redirect to homepage
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header (Figma-like) */}
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
            <Link to="/dashboard" className="text-[#EB4747] font-semibold">Dashboard</Link>
            <Link to="/workouts" className="text-gray-400 hover:text-white">Workouts</Link>
            <Link to="/nutrition" className="text-gray-400 hover:text-white">Nutrition</Link>
            <Link to="/realtime" className="text-gray-400 hover:text-white">Tracking</Link>
            <Link to="/coach" className="text-gray-400 hover:text-white">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
            <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
            <Link to="/practice" className="text-gray-400 hover:text-white">Practice Room</Link>
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
        <h2 className="text-[36px] font-extrabold mt-8 mb-4">Welcome back, {user?.full_name?.split(' ')?.[0] || 'Athlete'} 👋</h2>

        {/* Quick Goal Status */}
        <section className="w-full bg-[#1E1E1E] rounded-2xl shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] p-6 mb-6">
          <p className="text-xs tracking-wider text-gray-400">QUICK GOAL STATUS</p>
          <p className="mt-1 text-lg font-semibold">
            {onboardingStep2?.fitness_goals?.length && aiAssessment?.time_to_goal
              ? `On track for ${onboardingStep2.fitness_goals[0]} (ETA: ${aiAssessment.time_to_goal})`
              : 'On track for Lose Weight (ETA: 3 months)'}
          </p>
          <div className="mt-4 rounded-lg bg-black/20 p-4">
            <p className="text-gray-400 text-sm">"Success is the sum of small efforts, repeated day in and day out. You're doing great, keep it up!"</p>
          </div>
        </section>

        {/* 2x3 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Health Summary */}
          <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-[20px] font-bold mb-4">AI Health Summary</h3>
            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
              <p className="font-semibold">BMI: {bmiDisplay}</p>
              <p className="font-semibold">Total Calories Needed: {tdeeDisplay}</p>
            </div>
            <p className="text-sm font-semibold">Overall Health Score: {aiAssessment ? `${aiAssessment.health_score}%` : '—'}</p>
            <div className="h-2 rounded-full bg-[#374151] mb-2">
              <div className="h-2 rounded-full bg-[#EB4747]" style={{ width: `${aiAssessment?.health_score ?? 0}%` }}></div>
            </div>
            <p className="text-sm font-semibold">Time to Goal: {aiAssessment?.time_to_goal || '—'}</p>
            <button
              onClick={() => setShowAssessmentModal(true)}
              className="w-full h-12 mt-4 bg-[#EB4747] hover:bg-[#d13f3f] rounded-lg font-bold"
            >
              View Full Assessment
            </button>
          </section>

          {/* Workout Summary */}
          <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-[20px] font-bold mb-1">Workout Summary</h3>
            <p className="text-sm text-gray-400 mb-3">
              {workoutSummary ? `${workoutSummary.workouts_completed_this_week} of ${workoutSummary.workouts_total_this_week || 5} workouts completed this week.` : 'Loading...'}
            </p>
            <div className="rounded-lg bg-black/20 p-4 mb-4">
              <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-400 mb-2">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, idx) => {
                  const isCompleted = workoutSummary?.completion_days?.includes(idx) || false;
                  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                  return (
                    <div key={idx} className={`h-8 rounded-full flex items-center justify-center text-sm ${isCompleted ? 'bg-green-500/50 text-white' : 'bg-white/10 text-white/50'}`}>{dayNames[idx]}</div>
                  );
                })}
              </div>
            </div>
            <button onClick={() => navigate('/workouts')} className="w-full h-12 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10 font-bold">Go to Workouts</button>
          </section>

          {/* Nutrition Summary */}
          <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-[20px] font-bold mb-4">Nutrition Summary</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Protein</span>
                  <span className="text-gray-400">{macrosToday ? `${Math.round(macrosToday.protein_consumed)}g / ${Math.round(macrosToday.protein_target)}g` : '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-[#374151]">
                  <div className="h-2 rounded-full bg-[#3B82F6]" style={{ width: `${macrosToday && macrosToday.protein_target > 0 ? Math.min((macrosToday.protein_consumed / macrosToday.protein_target) * 100, 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Carbs</span>
                  <span className="text-gray-400">{macrosToday ? `${Math.round(macrosToday.carbs_consumed)}g / ${Math.round(macrosToday.carbs_target)}g` : '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-[#374151]">
                  <div className="h-2 rounded-full bg-[#22C55E]" style={{ width: `${macrosToday && macrosToday.carbs_target > 0 ? Math.min((macrosToday.carbs_consumed / macrosToday.carbs_target) * 100, 100) : 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Fats</span>
                  <span className="text-gray-400">{macrosToday ? `${Math.round(macrosToday.fats_consumed)}g / ${Math.round(macrosToday.fats_target)}g` : '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-[#374151]">
                  <div className="h-2 rounded-full bg-[#EAB308]" style={{ width: `${macrosToday && macrosToday.fats_target > 0 ? Math.min((macrosToday.fats_consumed / macrosToday.fats_target) * 100, 100) : 0}%` }}></div>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                {macrosToday?.last_meal 
                  ? `Last meal: ${macrosToday.last_meal.name} (${macrosToday.last_meal.calories} cal) - ${new Date(macrosToday.last_meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
                  : 'No meals logged today'}
              </p>
            </div>
            <button onClick={() => navigate('/nutrition')} className="w-full h-12 mt-4 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10 font-bold">Go to Nutrition</button>
          </section>

          {/* Realtime Tracking */}
          <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-[20px] font-bold mb-6">Realtime Tracking</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl">👟</div>
                <div className="text-lg font-extrabold">{realtimeData ? realtimeData.steps.toLocaleString() : '—'}</div>
                <div className="text-xs text-gray-400">Steps</div>
              </div>
              <div>
                <div className="text-3xl">😴</div>
                <div className="text-lg font-extrabold">{realtimeData ? `${realtimeData.sleep_hours.toFixed(1)}h` : '—'}</div>
                <div className="text-xs text-gray-400">Sleep</div>
              </div>
              <div>
                <div className="text-3xl">❤️</div>
                <div className="text-lg font-extrabold">{realtimeData ? realtimeData.heart_rate : '—'}</div>
                <div className="text-xs text-gray-400">bpm</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <button 
                onClick={loadDashboardData} 
                disabled={dashboardLoading}
                className="w-full text-sm text-gray-300 hover:text-white disabled:opacity-50"
              >
                {dashboardLoading ? '⏳ Syncing...' : '🔄 Sync Now'}
              </button>
              <button onClick={() => navigate('/realtime')} className="w-full h-12 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10 font-bold">Go to Tracking</button>
            </div>
          </section>

          {/* Progress Highlights */}
          <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <h3 className="text-[20px] font-bold mb-4">Progress Highlights</h3>
            <div className="flex items-start gap-4">
              <div className="text-5xl leading-none">🔥</div>
              <div className="flex-1">
                <div className="text-xl font-extrabold">
                  {streakData ? `${streakData.current_streak} Day Streak!` : 'Loading...'}
                </div>
                <div className="text-sm text-gray-400">
                  {streakData && streakData.current_streak > 0 ? 'Keep the fire going!' : 'Start your streak today!'}
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Longest streak: {streakData ? `${streakData.longest_streak} days` : '—'}
                </div>
                <div className="mt-4 h-16 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center gap-1 px-2">
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const dayHasActivity = streakData && idx < streakData.current_streak;
                    return (
                      <div key={idx} className={`flex-1 h-full rounded ${dayHasActivity ? 'bg-[#EB4747]' : 'bg-white/10'}`}></div>
                    );
                  })}
                </div>
              </div>
            </div>
            <button onClick={() => navigate('/progress')} className="w-full h-12 mt-6 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10 font-bold">Go to Progress</button>
          </section>

          {/* AI Coach (Fluxie) */}
          <section className="bg-gradient-to-br from-[#1E1E1E] to-[#2A1F1F] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)] border border-[#EB4747]/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#EB4747] to-[#b83232] flex items-center justify-center text-2xl shadow-lg shadow-[#EB4747]/30">
                🤖
              </div>
              <div>
                <h3 className="text-[20px] font-bold">AI Coach (Fluxie)</h3>
                <p className="text-xs text-gray-400">Your personal fitness assistant</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <p className="text-sm text-gray-300">Quick suggestions:</p>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => navigate('/coach')}
                  className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#EB4747]/30 text-left text-sm transition-all group"
                >
                  <span className="text-gray-200 group-hover:text-white">💪 "Optimize my workout plan"</span>
                </button>
                <button 
                  onClick={() => navigate('/coach')}
                  className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#EB4747]/30 text-left text-sm transition-all group"
                >
                  <span className="text-gray-200 group-hover:text-white">🍽️ "Suggest meals for today"</span>
                </button>
                <button 
                  onClick={() => navigate('/coach')}
                  className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#EB4747]/30 text-left text-sm transition-all group"
                >
                  <span className="text-gray-200 group-hover:text-white">📊 "Show my progress this week"</span>
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => navigate('/coach')} 
              className="w-full h-12 rounded-lg bg-gradient-to-r from-[#EB4747] to-[#d13f3f] hover:from-[#d13f3f] hover:to-[#b83232] font-bold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>Chat with Fluxie</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          </section>

          {/* Featured AI Blog */}
          <section className="md:col-span-2 xl:col-span-3 bg-[#1E1E1E] rounded-2xl p-0 overflow-hidden shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
            <div className="grid md:grid-cols-[410px_1fr]">
              <div className="h-[192px] bg-[url('/src/assets/images/fitness-hero-bg.jpg')] bg-cover bg-center" />
              <div className="p-6">
                <h3 className="text-[20px] font-bold mb-2">Featured AI Blog</h3>
                <p className="text-sm text-gray-400 mb-4">Unlock your potential with our latest AI-driven insights. This week, we explore the science of muscle recovery and how to optimize your rest days for maximum gains.</p>
                <button onClick={() => navigate('/blog')} className="h-12 px-4 rounded-lg bg-[#EB4747] hover:bg-[#d13f3f] font-bold">Explore Blogs</button>
              </div>
            </div>
          </section>
        </div>
      </main>
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAssessmentModal(false)}></div>
          <div className="relative z-10 w-full max-w-xl mx-4 bg-[#1E1E1E] border border-white/10 rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">AI Health Assessment</h3>
              <button onClick={() => setShowAssessmentModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400">BMI</p>
                  <p className="font-semibold">{bmiDisplay}</p>
                </div>
                <div>
                  <p className="text-gray-400">Calories Needed</p>
                  <p className="font-semibold">{tdeeDisplay}</p>
                </div>
                <div>
                  <p className="text-gray-400">Overall Health Score</p>
                  <p className="font-semibold">{aiAssessment ? `${aiAssessment.health_score}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Time to Goal</p>
                  <p className="font-semibold">{aiAssessment?.time_to_goal || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-400">Motivational Message</p>
                <p className="font-medium">{aiAssessment?.motivational_message || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Risks</p>
                <ul className="flex flex-wrap gap-2">
                  {(aiAssessment?.risk_profile || []).map((risk) => (
                    <li key={risk} className="text-xs text-gray-300 bg-white/10 border border-white/10 px-2 py-1 rounded-full">{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowAssessmentModal(false)} className="px-4 h-10 rounded-lg border border-white/20 text-sm text-gray-200 hover:bg-white/10">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

