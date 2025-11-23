import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS, API_BASE_URL } from '../config/api';

// Import new progress components
import MetricCard from '../components/progress/MetricCard';
import WorkoutCompletionChart from '../components/progress/WorkoutCompletionChart';
import CalorieChart from '../components/progress/CalorieChart';
import MacroBreakdown from '../components/progress/MacroBreakdown';
import MealComplianceChart from '../components/progress/MealComplianceChart';
import ActivityTrendChart from '../components/progress/ActivityTrendChart';
import GoalAchievementChart from '../components/progress/GoalAchievementChart';
import BadgesAndStreaks from '../components/progress/BadgesAndStreaks';
import SleepRecoveryScore from '../components/progress/SleepRecoveryScore';
import HydrationTrends from '../components/progress/HydrationTrends';
import BadgeNotification, { type BadgeUnlock } from '../components/ui/BadgeNotification';

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#1E1E1E] border border-white/10 rounded-2xl shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      {children}
    </div>
  );
}

type Milestone = {
  id: string;
  title: string;
  target_metric: string;
  target_value: number;
  start_value?: number;
  progress: number;
  completed: boolean;
  created_at?: string;
  completed_at?: string | null;
};

type Badge = { name: string; unlocked: boolean; unlocked_date?: string };

export default function ProgressPage() {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const authHeaders: Record<string, string> = token 
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } 
    : { 'Content-Type': 'application/json' };

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<{ current_streak: number; longest_streak: number }>({ current_streak: 0, longest_streak: 0 });
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [range, setRange] = useState<'1D' | '7D' | '1M' | '3M' | '1Y' | 'All'>('1M');
  
  // New state for comprehensive metrics
  const [realtimeData, setRealtimeData] = useState<any>(null);
  const [workoutData, setWorkoutData] = useState<any>(null);
  const [nutritionData, setNutritionData] = useState<any>(null);
  const [goalsData, setGoalsData] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  
  // Badge notification state
  const [badgeNotification, setBadgeNotification] = useState<BadgeUnlock | null>(null);
  const [badgeQueue, setBadgeQueue] = useState<BadgeUnlock[]>([]);

  const rangeStartDate = useMemo(() => {
    const now = new Date();
    switch (range) {
      case '1D': return new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Today
      case '7D': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      case '1M': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case '3M': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      case '1Y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      case 'All':
      default: return new Date(0);
    }
  }, [range]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    navigate('/');
  }, [navigate]);
  
  const fetchProgressData = async () => {
    if (!token) { setIsLoading(false); return; }
    try {
      setIsLoading(true);
      setError(null);
      
      // Fire-and-forget operations (don't block main data fetch)
      Promise.all([
        fetch(API_ENDPOINTS.NUTRITION.ACTIVITY, { method: 'POST', headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.BADGES_CHECK, { method: 'POST', headers: authHeaders })
        .then(res => res.json())
        .then(data => {
            if (data.newly_unlocked?.length > 0) {
            setBadgeQueue(prev => [...prev, ...data.newly_unlocked]);
          }
        })
      ]).catch(err => console.error('Background operations failed:', err));
      
      // Fetch critical data in parallel - optimized order
      const [
        userRes,
        obRes,
        streakRes,
        goalsRes,
        badgesRes,
        realtimeRes,
        caloriesRes,
        macrosRes,
        mealsRes,
        sleepRes,
        hydrationRes,
        workoutRes
      ] = await Promise.all([
        fetch(API_ENDPOINTS.AUTH.ME, { headers: authHeaders }),
        fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, { headers: authHeaders }),
        fetch(API_ENDPOINTS.NUTRITION.STREAK, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.GOALS, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.BADGES_ENHANCED, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/realtime/metrics`, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.CALORIES, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.MACROS, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.MEALS, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.SLEEP, { headers: authHeaders }),
        fetch(API_ENDPOINTS.PROGRESS.HYDRATION, { headers: authHeaders }),
        fetch(API_ENDPOINTS.WORKOUT.SESSION_TODAY, { headers: authHeaders })
      ]);
      
      // Process all responses in parallel for better performance
      const [
        userData,
        obData,
        streakData,
        goalsData,
        badgesData,
        realtimeData,
        calories,
        macros,
        meals,
        sleep,
        hydration,
        workoutData
      ] = await Promise.all([
        userRes.ok ? userRes.json() : null,
        obRes.ok ? obRes.json() : null,
        streakRes.ok ? streakRes.json() : null,
        goalsRes.ok ? goalsRes.json() : null,
        badgesRes.ok ? badgesRes.json() : [],
        realtimeRes.ok ? realtimeRes.json() : null,
        caloriesRes.ok ? caloriesRes.json() : [],
        macrosRes.ok ? macrosRes.json() : [],
        mealsRes.ok ? mealsRes.json() : [],
        sleepRes.ok ? sleepRes.json() : [],
        hydrationRes.ok ? hydrationRes.json() : [],
        workoutRes.ok ? workoutRes.json() : null
      ]);
      
      // Set user data
      if (userData) setUser(userData);
      if (obData?.step1) setOnboardingStep1(obData.step1);
      
      // Set streak data
      if (streakData) {
        setStreak({
          current_streak: streakData.current_streak || 0,
          longest_streak: streakData.longest_streak || 0
        });
      }
      
      // Set goals data (already processed by backend)
      if (goalsData) {
        setGoalsData(goalsData);
        
        // Extract milestones from goals for backward compatibility
        if (goalsData.goals) {
          setMilestones(goalsData.goals.map((goal: any) => ({
            id: goal.id,
            title: goal.title,
            target_metric: goal.category,
            target_value: goal.target,
            start_value: goal.current,
            progress: goal.achievement_rate || 0,
            completed: goal.completed || false,
            created_at: goal.created_at,
            completed_at: goal.completed_at
          })));
        }
      }
      
      // Set badges data
      if (badgesData) {
        setBadges(badgesData.map((badge: any) => ({
          name: badge.name,
          unlocked: badge.unlocked,
          unlocked_date: badge.unlocked_date
        })));
      }
      
      // Set realtime and workout data
      if (realtimeData) setRealtimeData(realtimeData);
      if (workoutData) setWorkoutData(workoutData);
      
      // Process and set nutrition data
      if (calories || macros || meals) {
        const processedNutritionData = {
          calories: {
            consumed: calories?.[0]?.consumed || 0,
            recommended: calories?.[0]?.recommended || 2200,
            dailyData: calories?.map((entry: any) => ({
              date: entry.date,
              consumed: entry.consumed,
              recommended: entry.recommended
            })) || []
          },
          macros: {
            protein: { 
              consumed: macros?.[0]?.protein || 0, 
              target: macros?.[0]?.protein_target || 150, 
              color: 'bg-gradient-to-r from-red-500 to-red-600' 
            },
            carbs: { 
              consumed: macros?.[0]?.carbs || 0, 
              target: macros?.[0]?.carbs_target || 250, 
              color: 'bg-gradient-to-r from-blue-500 to-blue-600' 
            },
            fats: { 
              consumed: macros?.[0]?.fats || 0, 
              target: macros?.[0]?.fats_target || 90, 
              color: 'bg-gradient-to-r from-green-500 to-green-600' 
            },
            dailyData: macros?.map((entry: any) => ({
              date: entry.date,
              protein: entry.protein,
              carbs: entry.carbs,
              fats: entry.fats
            })) || []
          },
          mealCompliance: {
            rate: meals?.length > 0 ? (meals.filter((m: any) => m.followed).length / meals.length * 100) : 0,
            totalMeals: meals?.length || 0,
            compliantMeals: meals?.filter((m: any) => m.followed).length || 0,
            dailyData: meals?.map((entry: any) => ({
              date: entry.date,
              meals: [{
                name: entry.meal_name,
                planned: entry.planned,
                followed: entry.followed,
                time: entry.time
              }]
            })) || []
          }
        };
        setNutritionData(processedNutritionData);
      }
      
      // Set health data
      if (sleep || hydration) {
        setHealthData({ sleep: sleep || [], hydration: hydration || [] });
      }
      
    } catch (e: any) {
      setError(e?.message || 'Failed to load progress');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchProgressData(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  
  // Memoized calculations for better performance
  const workoutCompletionRate = useMemo(() => {
    if (!workoutData) return 0;
    const total = workoutData.exercises?.length || 1;
    const completed = workoutData.completed_exercise_ids?.length || 0;
    return Math.round((completed / total) * 100);
  }, [workoutData]);
  
  const caloriesConsumed = useMemo(() => nutritionData?.calories?.consumed || 0, [nutritionData]);
  const caloriesRecommended = useMemo(() => nutritionData?.calories?.recommended || 2200, [nutritionData]);
  
  const currentSteps = useMemo(() => realtimeData?.steps || 0, [realtimeData]);
  const currentStreak = useMemo(() => streak.current_streak, [streak.current_streak]);
  const longestStreak = useMemo(() => streak.longest_streak, [streak.longest_streak]);
  
  // Handle badge queue - show one notification at a time
  useEffect(() => {
    if (badgeQueue.length > 0 && !badgeNotification) {
      // Show the first badge in queue
      setBadgeNotification(badgeQueue[0]);
      // Remove it from queue
      setBadgeQueue(prev => prev.slice(1));
    }
  }, [badgeQueue, badgeNotification]);
  
  const handleCloseBadgeNotification = () => {
    setBadgeNotification(null);
  };


  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Badge Notification */}
      <BadgeNotification badge={badgeNotification} onClose={handleCloseBadgeNotification} />
      
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
            <Link to="/progress" className="text-[#EB4747] font-semibold">Progress</Link>
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

      <main className="max-w-[1440px] mx-auto px-6 md:px-10 pt-[93px] pb-16">
        {/* Title + Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-[36px] font-extrabold tracking-tight">Progress Dashboard</h2>
            <p className="text-sm text-gray-400">Comprehensive health and fitness tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Range" className="bg-black/20 border border-white/10 rounded-xl p-1 flex">
              {(['1D','7D','1M','3M','1Y','All'] as const).map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  className={`px-3 h-9 rounded-lg text-sm transition-colors ${range === r ? 'bg-white text-black font-semibold' : 'text-gray-300 hover:text-white'}`}
                >{r === '1D' ? 'Today' : r}</button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 text-sm text-[#FCA5A5]">{error}</div>
        )}
        {isLoading && (
          <div className="mb-6 text-center py-8">
            <div className="inline-flex items-center gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              Loading progress data...
            </div>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Key Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Workout Completion"
                value={`${workoutCompletionRate}%`}
                subtitle="This week"
                trend="up"
                trendValue="+5%"
                icon="💪"
                color="success"
              />
              <MetricCard
                title="Calories Consumed"
                value={`${caloriesConsumed}`}
                subtitle={`of ${caloriesRecommended} target`}
                trend="neutral"
                icon="🔥"
                color="warning"
              />
              <MetricCard
                title="Daily Steps"
                value={`${currentSteps.toLocaleString()}`}
                subtitle="Goal: 10,000"
                trend="up"
                trendValue="+12%"
                icon="👟"
                color="info"
              />
              <MetricCard
                title="Current Streak"
                value={`${currentStreak} days`}
                subtitle={`Best: ${longestStreak}`}
                trend="up"
                icon="🔥"
                color="danger"
              />
            </div>

            {/* Workout & Nutrition Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card>
            <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Workout Completion</h3>
                  <WorkoutCompletionChart
                    completionRate={workoutCompletionRate}
                    totalWorkouts={workoutData?.exercises?.length || 0}
                    completedWorkouts={workoutData?.completed_exercise_ids?.length || 0}
                    weeklyData={Array.from({ length: 7 }, (_, i) => ({
                      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
                      completed: Math.random() > 0.3,
                      planned: Math.random() > 0.1
                    }))}
                  />
            </div>
          </Card>

          <Card>
            <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Calorie Intake</h3>
                  <CalorieChart
                    consumed={caloriesConsumed}
                    recommended={caloriesRecommended}
                    dailyData={nutritionData?.calories?.dailyData || []}
                  />
                  </div>
              </Card>
              </div>

            {/* Macronutrients & Meal Compliance Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Macronutrient Breakdown</h3>
                  <MacroBreakdown
                    macros={nutritionData?.macros || {
                      protein: { consumed: 0, target: 150, color: 'bg-gradient-to-r from-red-500 to-red-600' },
                      carbs: { consumed: 0, target: 250, color: 'bg-gradient-to-r from-blue-500 to-blue-600' },
                      fats: { consumed: 0, target: 90, color: 'bg-gradient-to-r from-green-500 to-green-600' }
                    }}
                    dailyData={nutritionData?.macros?.dailyData || []}
                  />
            </div>
          </Card>

          <Card>
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Meal Compliance</h3>
                  <MealComplianceChart
                    complianceRate={nutritionData?.mealCompliance?.rate || 0}
                    totalMeals={nutritionData?.mealCompliance?.totalMeals || 0}
                    compliantMeals={nutritionData?.mealCompliance?.compliantMeals || 0}
                    dailyData={nutritionData?.mealCompliance?.dailyData || []}
                  />
            </div>
          </Card>
        </div>

            {/* Activity & Goals Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card>
            <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Activity Trends</h3>
                  <ActivityTrendChart
                    currentSteps={currentSteps}
                    dailyGoal={10000}
                    weeklyData={Array.from({ length: 7 }, (_, i) => ({
                      date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      steps: Math.floor(Math.random() * 5000) + 5000,
                      calories: Math.floor(Math.random() * 500) + 2000,
                      distance: Math.random() * 5 + 2
                    }))}
                  />
            </div>
          </Card>

          <Card>
            <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Goal Achievement</h3>
                  <GoalAchievementChart
                    goals={goalsData?.goals || []}
                    achievementRate={goalsData?.achievement_rate || 0}
                    completedGoals={goalsData?.completed_goals || 0}
                    totalGoals={goalsData?.total_goals || 0}
                  />
              </div>
              </Card>
                    </div>

            {/* Health & Recovery Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Sleep & Recovery</h3>
                  <SleepRecoveryScore
                    currentScore={healthData?.sleep?.length > 0 ? healthData.sleep[0].recovery_score : 85}
                    sleepData={healthData?.sleep?.map((entry: any) => ({
                      date: entry.date,
                      duration: entry.duration,
                      quality: entry.quality,
                      deepSleep: entry.deep_sleep,
                      remSleep: entry.rem_sleep,
                      lightSleep: entry.light_sleep,
                      awakenings: entry.awakenings
                    })) || []}
                    weeklyAverage={healthData?.sleep?.length > 0 ? 
                      healthData.sleep.reduce((sum: number, entry: any) => sum + (entry.recovery_score || 0), 0) / healthData.sleep.length : 82}
                    targetHours={8}
                  />
            </div>
          </Card>

          <Card>
            <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Hydration Trends</h3>
                  <HydrationTrends
                    currentIntake={healthData?.hydration?.length > 0 ? healthData.hydration[0].consumed : 1500}
                    dailyTarget={healthData?.hydration?.length > 0 ? healthData.hydration[0].target : 2500}
                    hydrationData={healthData?.hydration?.map((entry: any) => ({
                      date: entry.date,
                      consumed: entry.consumed,
                      target: entry.target,
                      bottles: Math.floor(entry.consumed / 500),
                      reminders: entry.reminders || 0
                    })) || []}
                    weeklyAverage={healthData?.hydration?.length > 0 ? 
                      healthData.hydration.reduce((sum: number, entry: any) => sum + entry.consumed, 0) / healthData.hydration.length : 2100}
                  />
            </div>
          </Card>
        </div>

            {/* Badges & Streaks Row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card>
            <div className="p-6">
                  <BadgesAndStreaks
                    badges={badges.length > 0 ? badges.map((badge: any) => ({
                      id: badge.name || String(Math.random()),
                      name: badge.name || 'Unknown Badge',
                      description: badge.description || badge.name || 'Achievement',
                      icon: badge.icon || '🏆',
                      unlocked: badge.unlocked || false,
                      unlockedDate: badge.unlocked_date || badge.unlockedDate || undefined,
                      rarity: (badge.rarity || 'common') as 'common' | 'rare' | 'epic' | 'legendary'
                    })) : []}
                    streaks={[
                      { type: 'workout', current: streak.current_streak, longest: streak.longest_streak, lastActivity: new Date().toISOString() },
                      { type: 'nutrition', current: streak.current_streak, longest: streak.longest_streak, lastActivity: new Date().toISOString() },
                      { type: 'logging', current: streak.current_streak, longest: streak.longest_streak, lastActivity: new Date().toISOString() },
                      { type: 'general', current: streak.current_streak, longest: streak.longest_streak, lastActivity: new Date().toISOString() }
                    ]}
                    totalBadges={badges.length || 0}
                    unlockedBadges={badges.filter((b: any) => b.unlocked).length || 0}
                  />
                </div>
              </Card>

              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
                  <div className="space-y-4">
                    <button 
                      onClick={() => {
                        // Generate a detailed report with all progress data
                        const reportData = {
                          nutrition: nutritionData,
                          health: healthData,
                          realtime: realtimeData,
                          streak: streak,
                          badges: badges,
                          goals: goalsData
                        };
                        console.log('Detailed Progress Report:', reportData);
                        // TODO: Implement detailed report view/export functionality
                        alert('Detailed report generation coming soon! Check console for data.');
                      }}
                      className="w-full p-4 rounded-xl bg-gradient-to-r from-[#EB4747] to-[#FF6B6B] text-white font-semibold hover:from-[#d13f3f] hover:to-[#e55a5a] transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>📊</span>
                        <span>View Detailed Reports</span>
                      </div>
                    </button>
              </div>
            </div>
          </Card>
        </div>
          </>
        )}

      </main>
    </div>
  );
}


