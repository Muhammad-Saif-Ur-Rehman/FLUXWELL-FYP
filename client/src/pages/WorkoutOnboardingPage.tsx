import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../config/api';

type Step2Form = {
  // Backend-aligned fields (existing)
  activityLevel: string;
  fitnessGoals: string[];
  timeAvailable: string; // minutes per day
  preferredWorkoutType: string;
  // UI-only fields from Figma design
  location: string; // home | gym | outdoor | mixed
  equipment: string[]; // tags
  outdoorActivities: string[]; // tags
  stylePreference: string; // strength | cardio | yoga | hiit | mixed
  experienceLevel: string; // beginner | intermediate | advanced
};

const DEFAULT_FORM: Step2Form = {
  activityLevel: '',
  fitnessGoals: [],
  timeAvailable: '',
  preferredWorkoutType: '',
  location: '',
  equipment: [],
  outdoorActivities: [],
  stylePreference: '',
  experienceLevel: '',
};

// Removed legacy activity level select UI; using experience level mapping instead

const LOCATION_OPTIONS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'gym', label: 'Gym', icon: '💪' },
  { key: 'outdoor', label: 'Outdoor', icon: '🌳' },
  { key: 'mixed', label: 'Mixed', icon: '🤸' },
] as const;

const EQUIPMENT_OPTIONS = [
  'None',
  'Bodyweight only',
  'Dumbbells',
  'Resistance Bands',
  'Kettlebell',
  'Custom',
] as const;

const OUTDOOR_OPTIONS = [
  'Running',
  'Cycling',
  'Bodyweight Circuits',
  'Outdoor HIIT',
] as const;

const STYLE_OPTIONS = [
  { key: 'strength', label: 'Strength Training' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'yoga', label: 'Yoga/Flexibility' },
  { key: 'hiit', label: 'HIIT' },
  { key: 'mixed', label: 'Mixed' },
] as const;

const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Beginner', icon: '🌱' },
  { key: 'intermediate', label: 'Intermediate', icon: '💪' },
  { key: 'advanced', label: 'Advanced', icon: '🔥' },
] as const;

const WorkoutOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<Step2Form>(DEFAULT_FORM);
  const [initialStep2, setInitialStep2] = useState<any | null>(null);
  const [formProfilePic, setFormProfilePic] = useState<string | null>(null);
  const [timeMax, setTimeMax] = useState<number>(120);
  const [customEquipText, setCustomEquipText] = useState<string>('');

  const profileImageUrl = useMemo(() => {
    if (!user) return null;
    const provider = user?.auth_provider;
    if (provider === 'google' || provider === 'fitbit') return user?.profile_picture_url || null;
    // For form users, use step1 profile picture when available
    return formProfilePic || null;
  }, [user, formProfilePic]);

  const preferredWorkoutDisplay = useMemo(() => {
    const key = String(form.preferredWorkoutType || form.stylePreference || '').toLowerCase();
    const found = STYLE_OPTIONS.find((o) => o.key === key);
    return found?.label || '';
  }, [form.preferredWorkoutType, form.stylePreference]);

  const locationDisplay = useMemo(() => {
    const key = String(form.location || '').toLowerCase();
    const found = LOCATION_OPTIONS.find((o) => o.key === key);
    return found?.label || '';
  }, [form.location]);

  const toggleFromArray = (field: 'equipment' | 'outdoorActivities', value: string) => {
    setForm((prev) => {
      if (field === 'equipment') {
        const currentlySelected: string[] = (prev as any).equipment || [];
        if (value === 'None') {
          // Toggle None: if already selected, clear; else select only None
          const isNoneActive = currentlySelected.includes('None');
          const next = isNoneActive ? [] : ['None'];
          // Clear custom input when switching to None
          setCustomEquipText('');
          return { ...prev, equipment: next } as Step2Form;
        }
        // Ignore other selections if None is active
        if (currentlySelected.includes('None')) {
          return prev as Step2Form;
        }
      }
      const exists = (prev as any)[field].includes(value);
      const next = exists ? (prev as any)[field].filter((v: string) => v !== value) : ([...(prev as any)[field], value]);
      return { ...prev, [field]: next } as Step2Form;
    });
  };

  const normalizePreferredWorkoutType = (value: string): string => {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return 'mixed'; // Default to 'mixed' instead of empty string
    if (s.includes('strength')) return 'strength';
    if (s.includes('cardio')) return 'cardio';
    if (s.includes('yoga')) return 'yoga';
    if (s.includes('hiit')) return 'hiit';
    if (s.includes('mixed')) return 'mixed';
    // common alternates
    if (s.includes('weight')) return 'strength';
    if (s.includes('flexib')) return 'yoga';
    return 'mixed'; // Default fallback instead of returning the original value
  };

  const normalizeLocation = (value: string): string => {
    const s = String(value || '').trim().toLowerCase();
    if (['home', 'gym', 'outdoor', 'mixed'].includes(s)) return s;
    if (s.includes('home')) return 'home';
    if (s.includes('gym')) return 'gym';
    if (s.includes('outdoor')) return 'outdoor';
    if (s.includes('mix')) return 'mixed';
    return '';
  };

  const normalizeTimeAvailable = (value: string | number): string => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    const m = s.match(/\d+/);
    return m ? m[0] : '';
  };

  useEffect(() => {
    const init = async () => {
      try {
        const accessToken = localStorage.getItem('access_token');
        const savedUser = localStorage.getItem('user');
        if (!accessToken || !savedUser) {
          navigate('/login');
          return;
        }
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);

        const resp = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const step2 = data?.step2 || {};
          const step1 = data?.step1 || {};
          if (step1?.profile_picture_url) {
            setFormProfilePic(step1.profile_picture_url);
          }
          setInitialStep2(step2);
          // Map backend activity_level -> experienceLevel default
          const activityToExperience: Record<string, string> = {
            'sedentary': 'beginner',
            'lightly active': 'beginner',
            'moderately active': 'intermediate',
            'very active': 'advanced',
            'extra active': 'advanced',
          };
          const normalizedActivity = String(step2.activity_level || '').toLowerCase();
          const inferredExperience = activityToExperience[normalizedActivity] || '';

          const canonicalPref = normalizePreferredWorkoutType(step2.preferred_workout_type || '');
          const canonicalTime = normalizeTimeAvailable(step2.time_available || '');
          const canonicalLoc = normalizeLocation(step2.preferred_workout_type || step2.workout_location || step2.location || step2.preferred_workout_location || '');

          const allowedStyleKeys = STYLE_OPTIONS.map((s) => s.key);
          const styleDefault = allowedStyleKeys.includes(canonicalPref as any) ? canonicalPref : 'mixed';

          // Always cap at 120 minutes maximum
          setTimeMax(120);

          setForm({
            activityLevel: step2.activity_level || '',
            fitnessGoals: step2.fitness_goals || [],
            timeAvailable: canonicalTime,
            preferredWorkoutType: '',
            // UI-only; initialize from existing data when possible
            location: canonicalLoc,
            equipment: [],
            outdoorActivities: [],
            stylePreference: styleDefault,
            experienceLevel: inferredExperience,
          });

          // If no location from onboarding, try to prefill from existing workout profile
          if (!canonicalLoc) {
            try {
              const userId = parsedUser?.id || parsedUser?._id;
              if (userId) {
                const profResp = await fetch(API_ENDPOINTS.WORKOUT.PROFILE, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (profResp.ok) {
                  const prof = await profResp.json();
                  if (prof && prof.location) {
                    setForm(prev => ({ ...prev, location: String(prof.location).toLowerCase() }));
                  } else {
                    // ensure a safe default if still empty
                    setForm(prev => ({ ...prev, location: prev.location || 'home' }));
                  }
                } else {
                  setForm(prev => ({ ...prev, location: prev.location || 'home' }));
                }
              } else {
                setForm(prev => ({ ...prev, location: prev.location || 'home' }));
              }
            } catch (_) {
              setForm(prev => ({ ...prev, location: prev.location || 'home' }));
            }
          }
        }
      } catch (e) {
        console.error('Failed to load onboarding data', e);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    navigate('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.experienceLevel || !form.timeAvailable) {
      setError('Please fill required fields: Experience level and Time available.');
      return;
    }

    try {
      setSaving(true);
      const userStr = localStorage.getItem('user');
      const accessToken = localStorage.getItem('access_token');
      if (!userStr) throw new Error('Not authenticated');
      const user = JSON.parse(userStr);
      const userId = user?.id || user?._id;
      if (!userId) throw new Error('Invalid user');

      // Map UI fields to WorkoutProfileIn
      const normalizeEquipment = (arr: string[]) => arr.map((v) => {
        const s = v.toLowerCase();
        if (s.includes('bodyweight')) return 'bodyweight';
        if (s.includes('dumbbell')) return 'dumbbells';
        if (s.includes('band')) return 'resistance_bands';
        if (s.includes('kettle')) return 'kettlebell';
        return 'other';
      });
      const normalizeOutdoor = (arr: string[]) => arr.map((v) => {
        const s = v.toLowerCase();
        if (s.includes('running')) return 'running';
        if (s.includes('cycling')) return 'cycling';
        if (s.includes('hiit')) return 'outdoor_hiit';
        if (s.includes('circuit')) return 'bodyweight_circuits';
        return 'running';
      });

      const canonicalPref = normalizePreferredWorkoutType(form.stylePreference || 'mixed');
      const canonicalTime = Number(normalizeTimeAvailable(form.timeAvailable || 45));
      const customEquipmentArr = (customEquipText || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const isNoneEquipment = form.equipment.includes('None');
      const payload = {
        location: normalizeLocation(form.location || 'home'),
        equipment: isNoneEquipment ? [] : normalizeEquipment(form.equipment),
        outdoor_activities: normalizeOutdoor(form.outdoorActivities),
        style_preferences: [canonicalPref],
        experience_level: String(form.experienceLevel).toLowerCase(),
        daily_minutes: canonicalTime || 45,
        custom_equipment: isNoneEquipment ? [] : customEquipmentArr,
      } as const;

      const resp = await fetch(API_ENDPOINTS.WORKOUT.PROFILE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || 'Failed to save');
      }
      // If user edited onboarding-collected fields, update onboarding.step2 as well
      try {
        const initialTime = String(initialStep2?.time_available || '');
        const initialPref = normalizeLocation(initialStep2?.preferred_workout_type || '');
        const newLoc = String(form.location || '').toLowerCase();
        const newTime = normalizeTimeAvailable(form.timeAvailable || '');
        const changed = initialPref !== newLoc || initialTime !== newTime;
        if (changed && accessToken) {
          const mergedStep2 = {
            activity_level: initialStep2?.activity_level ?? '',
            medical_conditions: initialStep2?.medical_conditions ?? [],
            fitness_goals: initialStep2?.fitness_goals ?? [],
            time_available: newTime,
            preferred_workout_type: newLoc,
            other_medical_condition: initialStep2?.other_medical_condition ?? '',
            custom_goal: initialStep2?.custom_goal ?? '',
          };
          await fetch(API_ENDPOINTS.AUTH.ONBOARDING_STEP2_UPDATE, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mergedStep2),
          });
        }
      } catch (e) {
        // Non-fatal: proceed even if this secondary update fails
        console.warn('Failed to update onboarding step2 fields from workout onboarding', e);
      }

      setSuccess('Your workout profile is saved.');
      setTimeout(() => navigate('/workouts'), 500);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#110E0E] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#110E0E] text-white font-['Manrope']">
      {/* Header */}
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
            <a href="#" className="text-gray-400 hover:text-white">Tracking</a>
            <a href="#" className="text-gray-400 hover:text-white">Coach</a>
            <a href="#" className="text-gray-400 hover:text-white">Progress</a>
            <a href="#" className="text-gray-400 hover:text-white">Blog</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={user?.full_name || 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold">{user?.full_name?.[0] || 'U'}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[896px] mx-auto px-6 md:px-10 pt-[73px] pb-12">
        <section className="text-center mt-12">
          <h1
            className="font-bold"
            style={{ fontFamily: 'Inter', fontSize: '34.45px', letterSpacing: '-0.052em', lineHeight: '1.16' }}
          >
            Workout Setup
          </h1>
          <p
            className="text-[#CCCCCC] mt-2"
            style={{ fontFamily: 'Inter', fontSize: '16.73px', lineHeight: '1.67' }}
          >
            Customize your fitness plan to match your goals and preferences.
          </p>
        </section>

        <section className="mt-8 bg-[#1A1515] rounded-2xl p-6 border border-white/10">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 1. Preferred Workout Location */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.6px', lineHeight: '1.42' }}>1. Preferred Workout Location</h3>
              {locationDisplay && (
                <p className="text-[#CCCCCC] mt-2" style={{ fontFamily: 'Inter', fontSize: '14.5px' }}>
                  Selected location: <span className="text-white font-semibold">{locationDisplay}</span>
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                {LOCATION_OPTIONS.map(opt => {
                  const active = form.location === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, location: opt.key }))}
                      className={`flex flex-col items-center justify-center h-[118px] rounded-lg border transition-colors ${active ? 'border-red-500 bg-red-500/10' : 'border-white/10 bg-[#1A1A1A] hover:bg-white/10'}`}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="mt-3 font-semibold" style={{ fontFamily: 'Inter', fontSize: '15.5px' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Equipment */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.5px', lineHeight: '1.43' }}>2. Equipment</h3>
              <p className="text-[#CCCCCC] mt-2" style={{ fontFamily: 'Inter', fontSize: '15px' }}>Select if you chose Home or Mixed.</p>
              {(form.location === 'home' || form.location === 'mixed') && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map(label => {
                    const active = form.equipment.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleFromArray('equipment', label)}
                        className={`px-4 h-10 rounded-full border text-sm transition-colors ${active ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/15 text-[#CCCCCC] hover:bg-white/20'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {/* Custom equipment input */}
                  {form.equipment.includes('Custom') && (
                    <div className="w-full mt-3">
                      <label className="block text-xs text-gray-400 mb-1">Custom equipment (comma-separated)</label>
                      <input
                        value={customEquipText}
                        onChange={(e) => setCustomEquipText(e.target.value)}
                        placeholder="e.g., Pull-up Bar, Bench, TRX"
                        className="w-full h-10 rounded-lg bg-black/20 border border-white/20 px-3 text-sm placeholder:text-gray-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Outdoor Activities */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.4px', lineHeight: '1.45' }}>3. Outdoor Activities</h3>
              <p className="text-[#CCCCCC] mt-2" style={{ fontFamily: 'Inter', fontSize: '14.9px' }}>Select if you chose Outdoor or Mixed.</p>
              {(form.location === 'outdoor' || form.location === 'mixed') && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {OUTDOOR_OPTIONS.map(label => {
                    const active = form.outdoorActivities.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleFromArray('outdoorActivities', label)}
                        className={`px-4 h-10 rounded-full border text-sm transition-colors ${active ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/15 text-[#CCCCCC] hover:bg-white/20'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Workout Style Preference */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.2px', lineHeight: '1.46' }}>4. Workout Style Preference</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {STYLE_OPTIONS.map(opt => {
                  const active = form.stylePreference === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, stylePreference: opt.key }))}
                      className={`px-4 h-10 rounded-full border text-sm transition-colors ${active ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 border-white/15 text-[#CCCCCC] hover:bg-white/20'}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Experience Level */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.5px', lineHeight: '1.43' }}>5. Experience Level</h3>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {EXPERIENCE_LEVELS.map(opt => {
                  const active = form.experienceLevel === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, experienceLevel: opt.key }))}
                      className={`flex flex-col items-center justify-center h-[118px] rounded-lg border transition-colors ${active ? 'border-red-500 bg-red-500/10' : 'border-white/10 bg-[#1A1A1A] hover:bg-white/10'}`}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="mt-3 font-semibold" style={{ fontFamily: 'Inter', fontSize: '15.4px' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6. Daily Workout Time Commitment */}
            <div>
              <h3 className="font-bold" style={{ fontFamily: 'Inter', fontSize: '19.4px', lineHeight: '1.45' }}>6. Daily Workout Time Commitment</h3>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="col-span-1">
                  <input
                    type="range"
                    min={10}
                    max={timeMax}
                    step={5}
                    value={Math.min(Number(form.timeAvailable) || Math.min(45, timeMax), timeMax)}
                    onChange={(e) => {
                      const next = Math.min(Number(e.target.value) || 0, timeMax);
                      setForm({ ...form, timeAvailable: String(next) });
                    }}
                    className="w-full accent-red-500"
                  />
                </div>
                <div className="md:text-right text-gray-100 font-bold" style={{ fontFamily: 'Inter', fontSize: '17px' }}>
                  {Math.min(Number(form.timeAvailable) || Math.min(45, timeMax), timeMax)} min
                </div>
              </div>
            </div>

            {/* Removed: medical conditions, other medical condition, custom goal */}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">{success}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-4 h-11 rounded-lg border border-white/20 text-sm text-gray-200 hover:bg-white/10"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 h-11 rounded-lg bg-[#EA2A2A] hover:bg-[#b91c1c] font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save & Generate Workout Plan'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

export default WorkoutOnboardingPage;


