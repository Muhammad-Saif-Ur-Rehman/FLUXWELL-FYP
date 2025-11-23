import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import { OnboardingNutritionData } from '../types/onboarding';
import logoIcon from '../assets/images/logo-icon.svg';

const DIET_TYPES = [
  'Balanced', 'Low Carb', 'Vegetarian', 'Vegan', 'Keto', 'Paleo', 'Custom'
];

const ALLERGY_PRESETS = ['Dairy', 'Gluten', 'Nuts', 'Soy', 'Shellfish', 'Eggs', 'Custom'];

const CUISINE_OPTIONS = [
  'Italian', 'Mexican', 'Indian', 'Chinese', 'Japanese', 'Mediterranean', 'Custom'
];

const COOKING_TIME_OPTIONS = ['Quick (15-30m)', 'Moderate (30-60m)', 'Leisurely (60+m)'];

export default function NutritionOnboardingPage() {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const authHeaders: Record<string, string> = useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  const [data, setData] = useState<OnboardingNutritionData>({
    dietType: 'Balanced',
    allergies: [],
    dislikedFoods: '',
    favoriteCuisines: [],
    mealsPerDay: 3,
    snacksPerDay: 2,
    cookingTimePreference: null,
  });
  const [customAllergy, setCustomAllergy] = useState('');
  const [customAllergyValue, setCustomAllergyValue] = useState('');
  const [customCuisine, setCustomCuisine] = useState('');
  const [customCuisineValue, setCustomCuisineValue] = useState('');
  const [customDietInput, setCustomDietInput] = useState('');
  const [customDietValue, setCustomDietValue] = useState('');
  const [customDietType, setCustomDietType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customAllergyActive, setCustomAllergyActive] = useState(false);
  const [customCuisineActive, setCustomCuisineActive] = useState(false);

  // Prefill from backend if exists
  useEffect(() => {
    const prefill = async () => {
      try {
        if (!token) return;
        const resp = await fetch(API_ENDPOINTS.NUTRITION.PROFILE, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) return;
        const json = await resp.json();
        const n = json || {};
        const backendDiet = typeof n.diet_type === 'string' ? n.diet_type : '';
        const isCustomDiet = backendDiet && !DIET_TYPES.includes(backendDiet);
        setData(prev => ({
          dietType: isCustomDiet ? 'Custom' : (backendDiet || prev.dietType),
          allergies: Array.isArray(n.allergies) ? n.allergies.filter((item: string) => ALLERGY_PRESETS.includes(item)) : prev.allergies,
          dislikedFoods: typeof n.disliked_foods === 'string' ? n.disliked_foods : prev.dislikedFoods,
          favoriteCuisines: Array.isArray(n.favorite_cuisines) ? n.favorite_cuisines.filter((item: string) => CUISINE_OPTIONS.includes(item)) : prev.favoriteCuisines,
          mealsPerDay: typeof n.meals_per_day === 'number' ? n.meals_per_day : prev.mealsPerDay,
          snacksPerDay: typeof n.snacks_per_day === 'number' ? n.snacks_per_day : prev.snacksPerDay,
          cookingTimePreference: n.cooking_time_preference || prev.cookingTimePreference,
        }));
        setCustomDietInput(isCustomDiet ? backendDiet : '');
        setCustomDietValue(isCustomDiet ? backendDiet : '');
        setCustomDietType(isCustomDiet ? backendDiet : '');
        const customAll = Array.isArray(n.allergies) ? n.allergies.find((a: string) => !ALLERGY_PRESETS.includes(a)) : '';
        setCustomAllergyValue(customAll || '');
        setCustomAllergy(customAll || '');
        setCustomAllergyActive(Boolean(customAll));
        const customCuisinePrefill = Array.isArray(n.favorite_cuisines) ? n.favorite_cuisines.find((c: string) => !CUISINE_OPTIONS.includes(c)) : '';
        setCustomCuisineValue(customCuisinePrefill || '');
        setCustomCuisine(customCuisinePrefill || '');
        setCustomCuisineActive(Boolean(customCuisinePrefill));
      } catch (error) {
        console.error('Failed to prefill nutrition data:', error);
      }
    };
    prefill();
  }, [token]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    navigate('/');
  }, [navigate]);

  const toggleChip = useCallback((key: 'allergies' | 'favoriteCuisines', value: string) => {
    const isCustomChip = value === 'Custom';
    if (key === 'allergies' && isCustomChip) {
      const newState = !customAllergyActive;
      setCustomAllergyActive(newState);
      if (!newState) {
        setCustomAllergy('');
        setCustomAllergyValue('');
      }
      return;
    }
    if (key === 'favoriteCuisines' && isCustomChip) {
      const newState = !customCuisineActive;
      setCustomCuisineActive(newState);
      if (!newState) {
        setCustomCuisine('');
        setCustomCuisineValue('');
      }
      return;
    }
    setData(prev => {
      const exists = prev[key].includes(value);
      return {
        ...prev,
        [key]: exists ? prev[key].filter(v => v !== value) : [...prev[key], value]
      };
    });
  }, [customAllergyActive, customCuisineActive, data.allergies, data.favoriteCuisines]);

  const onSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      if (!token) {
        navigate('/login');
        return;
      }
      const resolvedDiet = data.dietType === 'Custom' ? customDietValue.trim() : data.dietType;
      if (data.dietType === 'Custom' && !resolvedDiet) {
        setError('Please specify your custom diet type.');
        setIsSaving(false);
        return;
      }
      const payload = {
        diet_type: resolvedDiet,
        allergies: [
          ...data.allergies.filter(item => item && item.trim()),
          ...(customAllergyValue ? [customAllergyValue] : [])
        ],
        disliked_foods: data.dislikedFoods,
        favorite_cuisines: [
          ...data.favoriteCuisines.filter(item => item && item.trim()),
          ...(customCuisineValue ? [customCuisineValue] : [])
        ],
        meals_per_day: data.mealsPerDay,
        snacks_per_day: data.snacksPerDay,
        cooking_time_preference: data.cookingTimePreference,
      };
      const resp = await fetch(API_ENDPOINTS.NUTRITION.PROFILE, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || 'Failed to save');
      }
      const json = await resp.json();
      localStorage.setItem('nutrition_profile_configured', 'true');
      navigate('/nutrition', { replace: true, state: { fromOnboarding: true, nutritionExists: true } });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save';
      setError(errorMessage);
      console.error('Failed to save nutrition data:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header from Dashboard */}
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
            <a href="#" className="text-gray-400 hover:text-white">Blog</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              <span className="text-sm font-semibold">U</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-20 xl:px-28 pt-[88px] md:pt-[96px] py-8 md:py-12">
        {/* Intro */}
        <div className="mb-8 md:mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">Personalize Your Nutrition Plan</h2>
          <p className="text-white/70 mt-2 text-sm sm:text-base">Tailor your meals to fit your lifestyle and preferences.</p>
        </div>

        {/* Dietary Preferences */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          <div>
            <h3 className="text-base sm:text-lg font-bold">Dietary Preferences</h3>
            <p className="text-sm text-white/70">Choose your diet type, allergies, and dislikes.</p>
          </div>
          <fieldset className="space-y-6">
            {/* Diet Type */}
            <div>
              <div className="text-sm font-medium mb-2">Diet Type</div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {DIET_TYPES.map(opt => {
                  const selected = data.dietType === opt || (opt === 'Custom' && data.dietType === 'Custom');
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        if (opt === 'Custom') {
                          setData(prev => ({ ...prev, dietType: 'Custom' }));
                          setCustomDietType(prev => prev || customDietValue || '');
                        } else {
                          setData(prev => ({ ...prev, dietType: opt }));
                          setCustomDietValue('');
                          setCustomDietType('');
                        }
                      }}
                      className={
                        `px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-sm transition-colors ` +
                        (selected ? 'bg-[#EB4747] text-white' : 'bg-white/5 text-white hover:bg-white/10')
                      }
                    >{opt}</button>
                  );
                })}
              </div>
              {data.dietType === 'Custom' && (
                <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    value={customDietType}
                    onChange={e => {
                      const value = e.target.value;
                      setCustomDietType(value);
                      setCustomDietValue(value);
                    }}
                    onBlur={() => {
                      const value = customDietType.trim();
                      if (!value) {
                        setData(prev => ({ ...prev, dietType: 'Balanced' }));
                      }
                    }}
                    placeholder="Specify custom diet type"
                    className="flex-1 bg-black/20 border border-white/20 focus:border-[#EB4747] focus:ring-2 focus:ring-[#EB4747]/20 outline-none rounded-xl px-3 py-2 text-sm"
                    aria-label="Custom diet type input"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>

            {/* Allergies */}
            <div>
              <div className="text-sm font-medium mb-2">Allergies</div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {ALLERGY_PRESETS.map(a => {
                  const selected = a === 'Custom' ? customAllergyActive : data.allergies.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleChip('allergies', a)}
                      className={
                        `px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-sm transition-colors ` +
                        (selected ? 'bg-[#EB4747] text-white' : 'bg-white/5 text-white hover:bg-white/10')
                      }
                    >{a}</button>
                  );
                })}
              </div>
              {customAllergyActive && (
                <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    value={customAllergy}
                    onChange={e => {
                      const raw = e.target.value;
                      setCustomAllergy(raw);
                      setCustomAllergyValue(raw.trim());
                    }}
                    placeholder="Specify custom allergy"
                    className="flex-1 bg-black/20 border border-white/20 focus:border-[#EB4747] focus:ring-2 focus:ring-[#EB4747]/20 outline-none rounded-xl px-3 py-2 text-sm"
                    aria-label="Custom allergy input"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>

            {/* Disliked Foods */}
            <div>
              <div className="text-sm font-medium mb-2">Disliked Foods</div>
              <textarea
                value={data.dislikedFoods}
                onChange={e => setData(prev => ({ ...prev, dislikedFoods: e.target.value }))}
                placeholder="e.g., cilantro, mushrooms, olives"
                className="w-full min-h-[100px] sm:min-h-[120px] bg-white/5 border border-white/20 rounded-2xl p-3 text-sm"
                aria-label="Disliked foods input"
                rows={4}
              />
            </div>
          </fieldset>
        </section>

        <div className="h-px bg-white/10 my-6 md:my-8" />

        {/* Cuisine Preferences */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          <div>
            <h3 className="text-base sm:text-lg font-bold">Cuisine Preferences</h3>
            <p className="text-sm text-white/70">Select the cuisines you enjoy.</p>
          </div>
          <fieldset className="space-y-6">
            <div>
              <div className="text-sm font-medium mb-2">Favorite Cuisines</div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {CUISINE_OPTIONS.map(opt => {
                  const selected = opt === 'Custom' ? customCuisineActive : data.favoriteCuisines.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleChip('favoriteCuisines', opt)}
                      className={
                        `px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-sm transition-colors ` +
                        (selected ? 'bg-[#EB4747] text-white' : 'bg-white/5 text-white hover:bg-white/10')
                      }
                    >{opt}</button>
                  );
                })}
              </div>
              {customCuisineActive && (
                <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    value={customCuisine}
                    onChange={e => {
                      const raw = e.target.value;
                      setCustomCuisine(raw);
                      setCustomCuisineValue(raw.trim());
                    }}
                    placeholder="Specify custom cuisine"
                    className="flex-1 bg-black/20 border border-white/20 focus:border-[#EB4747] focus:ring-2 focus:ring-[#EB4747]/20 outline-none rounded-xl px-3 py-2 text-sm"
                    aria-label="Custom cuisine input"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </fieldset>
        </section>

        <div className="h-px bg-white/10 my-6 md:my-8" />

        {/* Meal Structure */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          <div>
            <h3 className="text-base sm:text-lg font-bold">Meal Structure</h3>
            <p className="text-sm text-white/70">Define your daily meal and snack routine.</p>
          </div>
          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div>
              <div className="text-sm font-medium mb-2">Meals per day</div>
              <div className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/20 rounded-2xl px-3 py-2 sm:px-4 sm:py-2">
                <button
                  type="button"
                  className="text-white/80 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md hover:bg-white/10"
                  onClick={() => setData(prev => ({ ...prev, mealsPerDay: Math.max(1, (prev.mealsPerDay || 3) - 1) }))}
                  aria-label="Decrease meals per day"
                >−</button>
                <div className="flex-1 text-center text-base sm:text-lg font-semibold">{data.mealsPerDay || 3}</div>
                <button
                  type="button"
                  className="text-white/80 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md hover:bg-white/10"
                  onClick={() => setData(prev => ({ ...prev, mealsPerDay: Math.min(8, (prev.mealsPerDay || 3) + 1) }))}
                  aria-label="Increase meals per day"
                >+</button>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Snacks per day</div>
              <div className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/20 rounded-2xl px-3 py-2 sm:px-4 sm:py-2">
                <button
                  type="button"
                  className="text-white/80 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md hover:bg-white/10"
                  onClick={() => setData(prev => ({ ...prev, snacksPerDay: Math.max(0, (prev.snacksPerDay || 2) - 1) }))}
                  aria-label="Decrease snacks per day"
                >−</button>
                <div className="flex-1 text-center text-base sm:text-lg font-semibold">{data.snacksPerDay || 2}</div>
                <button
                  type="button"
                  className="text-white/80 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md hover:bg-white/10"
                  onClick={() => setData(prev => ({ ...prev, snacksPerDay: Math.min(6, (prev.snacksPerDay || 2) + 1) }))}
                  aria-label="Increase snacks per day"
                >+</button>
              </div>
            </div>
          </fieldset>
        </section>

        <div className="h-px bg-white/10 my-6 md:my-8" />

        {/* Other Preferences */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-10">
          <div>
            <h3 className="text-base sm:text-lg font-bold">Other Preferences</h3>
            <p className="text-sm text-white/70">Additional preferences to fine-tune your plan.</p>
          </div>
          <fieldset>
            <div className="text-sm font-medium mb-2">Cooking Time</div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {COOKING_TIME_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setData(prev => ({ ...prev, cookingTimePreference: opt }))}
                  className={
                    `px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-sm ` +
                    (data.cookingTimePreference === opt ? 'bg-red-600 text-white' : 'bg-white/5 text-white')
                  }
                >{opt}</button>
              ))}
            </div>
          </fieldset>
        </section>

        {error && (
          <div className="mb-4 text-sm text-red-400">{error}</div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className={
              `w-full sm:w-auto px-6 sm:px-8 py-3 rounded-2xl font-semibold transition-colors ` +
              (isSaving ? 'bg-[#EB4747]/60 cursor-not-allowed' : 'bg-[#EB4747] hover:bg-[#d13f3f]')
            }
          >{isSaving ? 'Saving...' : 'Save & Continue'}</button>
        </div>
      </main>
    </div>
  );
}


