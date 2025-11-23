import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../config/api';
import {
  NutritionService,
  type MealLog,
  type MacroTargets,
  type NutritionProfile,
  type AgentPlan,
  type RefreshAgentPlanResponse,
  type MealSwapResponse,
} from '../services/nutritionService';
import { ProgressService } from '../services/progressService';

export default function NutritionPage() {
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [macros, setMacros] = useState<MacroTargets | null>(null);
  const [waterMl, setWaterMl] = useState<number>(0);
  const [groceryItems, setGroceryItems] = useState<string[]>([]);
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile | null>(null);
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<{ profile_picture_url?: string } | null>(null);
  const [agentSuggestions, setAgentSuggestions] = useState<string[]>([]);
  const [agentPlan, setAgentPlan] = useState<{ plan: AgentPlan[]; snacks: AgentPlan[] } | null>(null);
  const [isRefreshingPlan, setIsRefreshingPlan] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [waterGoal, setWaterGoal] = useState<number | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<{ title: string; steps: string[]; ingredients: string[] } | null>(null);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [planMacros, setPlanMacros] = useState<{ calories: number; protein_g: number; carbs_g: number; fats_g: number } | null>(null);
  const [swapContext, setSwapContext] = useState<{ open: boolean; mealType?: string; currentTitle?: string; kcal?: number; options: string[]; alternatives?: any[]; slotIndex?: number; isSnack?: boolean }>({ open: false, options: [], alternatives: [] });
  const [planState, setPlanState] = useState<'none' | 'generated' | 'saved'>('none');

  const loadAgentPlan = useCallback(async (force = false) => {
    try {
      setIsRefreshingPlan(true);
      const result = await NutritionService.refreshAgentPlan(force);

      console.log('Agent plan response:', result);

      // Check if this is cached data or fresh data
      if (result.cached) {
        console.log('Using cached agent plan');
      } else {
        console.log('Fresh agent plan generated');
      }

      // Check if the plan has actual meal data
      const plan = result.plan || [];
      const snacks = result.snacks || [];

      console.log('Plan meals:', plan.length, 'Snacks:', snacks.length);

      if (plan.length > 0) {
        console.log('First meal:', plan[0]);
      }

      // Auto-generated plans should show swap buttons
      // Only user-saved plans should hide swap buttons

      setAgentPlan({ plan, snacks });

      // Check if this is saved by user or just cached/generated
      // If result.saved is explicitly true, user explicitly saved the plan (no swap buttons)
      // If result.saved is false, undefined, or missing, plan is cached/generated (show swap buttons)
      const isUserSaved = result.saved === true;
      setPlanState(isUserSaved ? 'saved' : (result.plan && result.plan.length > 0 ? 'generated' : 'none'));

      const suggestions = Array.isArray(result.suggestions)
        ? result.suggestions.map(String)
        : [];
      setAgentSuggestions(suggestions);

      if (typeof result.water_goal_ml === 'number') {
        setWaterGoal(result.water_goal_ml);
      } else if (result.water_goal_ml === null || result.water_goal_ml === undefined) {
        setWaterGoal(2000); // Default water goal
      }
      if (result.plan_macros) {
        setPlanMacros(result.plan_macros);
      }
      if (Array.isArray(result.grocery_list)) {
        setGroceryItems(result.grocery_list);
      }
    } catch (e) {
      console.error('Failed loading agent plan', e);
      alert('Failed to load meal plan. Please try again.');
    } finally {
      setIsRefreshingPlan(false);
    }
  }, []);


  const regeneratePlan = useCallback(async () => {
    await loadAgentPlan(true);
  }, [loadAgentPlan]);

  const savePlan = useCallback(async () => {
    if (!agentPlan || isSavingPlan || (agentPlan.plan.length === 0 && agentPlan.snacks.length === 0)) {
      if (!agentPlan || (agentPlan.plan.length === 0 && agentPlan.snacks.length === 0)) {
        alert('No meal plan to save. Please generate a meal plan first.');
      }
      return;
    }

    setIsSavingPlan(true);
    try {
      // Generate improved grocery list from current plan ingredients
      const itemsFromPlan = (agentPlan.plan || []).concat(agentPlan.snacks || [])
        .flatMap(entry => entry?.ingredients || [])
        .map(item => item?.trim())
        .filter((item): item is string => Boolean(item));

      // Use the same logic as backend for generating practical grocery lists
      const aggregated = new Map<string, number>();

      itemsFromPlan.forEach(ingredient => {
        // Parse ingredient (simplified version of backend logic)
        const match = ingredient.match(/^(\d+(?:\.\d+)?)\s*(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|lb|pound|pounds|oz|ounce|ounces)\s+(.+)$/i);
        if (match) {
          const quantity = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          const item = match[3].trim();

          // Convert to standard units (simplified)
          let standardQuantity = quantity;
          if (unit.includes('cup')) standardQuantity *= 240;
          else if (unit.includes('tbsp') || unit.includes('tablespoon')) standardQuantity *= 15;
          else if (unit.includes('tsp') || unit.includes('teaspoon')) standardQuantity *= 5;
          else if (unit.includes('kg') || unit.includes('kilogram')) standardQuantity *= 1000;
          else if (unit.includes('lb') || unit.includes('pound')) standardQuantity *= 454;
          else if (unit.includes('oz') || unit.includes('ounce')) standardQuantity *= 28;

          const cleanItem = item.replace(/\b(grilled|cooked|raw|fresh|dried|chopped|sliced|diced)\b/gi, '').trim();
          aggregated.set(cleanItem, (aggregated.get(cleanItem) || 0) + standardQuantity);
        }
      });

      const generatedGroceryList = Array.from(aggregated.entries())
        .map(([item, quantity]) => {
          if (quantity < 50) return `${item} (small amount)`;
          if (quantity < 200) return `${Math.round(quantity)}g ${item}`;
          if (quantity < 1000) return `${Math.round(quantity)}g ${item}`;
          return `${Math.round(quantity / 1000)}kg ${item}`;
        });

      // Save the current plan to database with all required fields
      // Note: water_goal_ml is computed fresh in the backend based on current profile/macros
      const saveResponse = await NutritionService.saveAgentPlan({
        plan: agentPlan.plan,
        snacks: agentPlan.snacks,
        grocery_list: generatedGroceryList,
        suggestions: agentSuggestions,
        plan_macros: planMacros,
      });

      // Update the state with the saved plan data
      if (saveResponse.plan) {
        setAgentPlan({ plan: saveResponse.plan, snacks: saveResponse.snacks || [] });
      }
      if (typeof saveResponse.water_goal_ml === 'number') {
        setWaterGoal(saveResponse.water_goal_ml); // This should now be the freshly computed value
      }
      if (Array.isArray(saveResponse.grocery_list)) {
        setGroceryItems(saveResponse.grocery_list);
      }
      if (saveResponse.plan_macros) {
        setPlanMacros(saveResponse.plan_macros);
      }

      setPlanState('saved');
      console.log('Plan saved successfully');
    } catch (error) {
      console.error('Failed to save plan:', error);
      alert('Failed to save plan. Please try again.');
    } finally {
      setIsSavingPlan(false);
    }
  }, [agentPlan, waterGoal, groceryItems, agentSuggestions, planMacros, isSavingPlan]);

  const requestPlan = useCallback(async () => {
    try {
      const planResponse = await NutritionService.generateAgentPlan();
      setAgentPlan({ plan: planResponse.plan || [], snacks: planResponse.snacks || [] });
      const suggestions = Array.isArray(planResponse.suggestions)
        ? planResponse.suggestions.map(String)
        : [];
      setAgentSuggestions(suggestions);
      if (typeof planResponse.water_goal_ml === 'number') {
        setWaterGoal(planResponse.water_goal_ml);
      } else if (planResponse.water_goal_ml === null || planResponse.water_goal_ml === undefined) {
        setWaterGoal(2000); // Default water goal
      }
      if (planResponse.plan_macros) {
        setPlanMacros(planResponse.plan_macros);
      }
      if (Array.isArray(planResponse.grocery_list)) {
        setGroceryItems(planResponse.grocery_list);
      }
    } catch (e) {
      console.error('Failed generating agent plan', e);
    }
  }, []);

  const handleSwap = useCallback(async (slotLabel: string, slotIndex?: number) => {
    try {
      // Determine if this is a snack or meal and find the correct item and index
      const isSnack = slotLabel.toLowerCase().includes('snack');
      const sourceArray = isSnack ? (agentPlan?.snacks || []) : (agentPlan?.plan || []);
      
      // Find the item by exact label match first
      let current: any = null;
      let actualIndex = -1;
      
      if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < sourceArray.length) {
        // Use provided index if valid
        current = sourceArray[slotIndex];
        actualIndex = slotIndex;
      } else {
        // Find by label match
        actualIndex = sourceArray.findIndex(m => (m.meal_type || '').toLowerCase() === (slotLabel || '').toLowerCase());
        if (actualIndex >= 0) {
          current = sourceArray[actualIndex];
        }
      }
      
      const kcal = current?.calories || undefined;
      const resp = await NutritionService.mealSwap({ 
        meal_type: slotLabel, 
        current_meal_title: current?.title, 
        alternatives_count: 3, 
        desired_profile: kcal ? { calories: kcal } : undefined,
        slot_index: actualIndex >= 0 ? actualIndex : undefined,
        is_snack: isSnack
      });

      console.log('Swap response:', resp);

      // Handle alternatives - they can be either strings or detailed meal objects
      let opts: string[] = [];
      let alternatives: any[] = [];

      if (resp?.alternatives && Array.isArray(resp.alternatives)) {
        alternatives = resp.alternatives;
        opts = resp.alternatives.map((alt: any) => {
          // If it's a detailed meal object, use the title
          if (typeof alt === 'object' && alt !== null) {
            return alt.title || alt.name || String(alt);
          }
          // If it's already a string, use it directly
          return String(alt);
        });
      } else if (resp?.swaps && typeof resp.swaps === 'object') {
        opts = Object.values(resp.swaps).flat().map(String);
      }

      // If no alternatives found, show error message
      if (opts.length === 0) {
        console.warn('No swap alternatives received from API');
        alert('Unable to generate meal alternatives. Please try regenerating your meal plan.');
        return;
      }

      setSwapContext({ 
        open: true, 
        mealType: slotLabel, 
        currentTitle: current?.title, 
        kcal, 
        options: opts.slice(0, 3), 
        alternatives,
        slotIndex: actualIndex >= 0 ? actualIndex : undefined,
        isSnack
      });
    } catch (e) {
      console.error('Failed to fetch swap alternatives', e);
      alert('Failed to fetch meal alternatives. Please try again.');
    }
  }, [agentPlan]);

  const confirmSwap = useCallback(async (choice: string) => {
    try {
      if (!swapContext.mealType) return;

      // Find the detailed meal object for the selected choice
      const selectedAlternative = swapContext.alternatives?.find(alt =>
        typeof alt === 'object' && alt !== null && (alt.title === choice || alt.name === choice)
      );

      const result = await NutritionService.mealSwap({
        meal_type: swapContext.mealType,
        current_meal_title: swapContext.currentTitle,
        swap_in_meal: selectedAlternative || { title: choice },
        slot_index: swapContext.slotIndex,
        is_snack: swapContext.isSnack
      });

      if (result?.plan || result?.snacks) {
        setAgentPlan({ plan: result.plan || [], snacks: result.snacks || [] });

        // Update plan state based on backend response
        // If the plan was saved before, it remains saved
        // If it was generated, it remains generated
        const isUserSaved = result.saved === true;
        setPlanState(isUserSaved ? 'saved' : 'generated');

        // Update other state from response
        if (result.plan_macros) {
          setPlanMacros(result.plan_macros);
        }
        if (Array.isArray(result.grocery_list)) {
          setGroceryItems(result.grocery_list);
        }
        if (typeof result.water_goal_ml === 'number') {
          setWaterGoal(result.water_goal_ml);
        }
      }
    } catch (e) {
      console.error('Failed to apply meal swap', e);
      alert('Failed to apply meal swap. Please try again.');
    } finally {
      setSwapContext({ open: false, options: [], alternatives: [] });
    }
  }, [swapContext.mealType, swapContext.currentTitle, swapContext.alternatives, swapContext.slotIndex, swapContext.isSnack]);

  const navigate = useNavigate();
  const waterGoalMl = waterGoal ?? 2000; // Default should match backend default

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

  useEffect(() => {
    const load = async () => {
      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        const [mealsResp, macrosResp, waterResp] = await Promise.all([
          NutritionService.listMeals({ start: today, end: today }), // Only load TODAY's meals
          NutritionService.getMacros(),
          NutritionService.waterToday(),
        ]);
        setMeals(mealsResp);
        setMacros(macrosResp);
        setWaterMl(waterResp.total_ml || 0);
        // Don't set water goal here - let the agent plan loading handle it
        // if (typeof waterResp.goal_ml === 'number') {
        //   setWaterGoal(waterResp.goal_ml);
        // }
      } catch (e) {
        console.error('Failed loading nutrition data', e);
      }
      try {
        const profileResp = await NutritionService.getProfile();
        setNutritionProfile(profileResp);
      } catch (e) {
        console.error('Failed loading nutrition profile', e);
      }
      // Load the agent plan (this will auto-generate if none exists and set the correct water goal)
      await loadAgentPlan();
    };
    load();
  }, [loadAgentPlan]);

  // Calculate current macro intake from logged meals
  const calculateCurrentMacros = useCallback((meals: MealLog[]) => {
    let currentCalories = 0;
    let currentProtein = 0;
    let currentCarbs = 0;
    let currentFats = 0;

    meals.forEach(meal => {
      // Handle both complex format (items array) and simple format (direct fields)
      if (meal.items && meal.items.length > 0) {
        meal.items.forEach(item => {
          currentCalories += item.calories || 0;
          currentProtein += item.protein_g || 0;
          currentCarbs += item.carbs_g || 0;
          currentFats += item.fats_g || 0;
        });
      }
      // Note: Simple format with direct fields on meal is handled in the items array case
    });

    return {
      calories: Math.round(currentCalories),
      protein_g: Math.round(currentProtein),
      carbs_g: Math.round(currentCarbs),
      fats_g: Math.round(currentFats),
    };
  }, []);

  const currentMacros = useMemo(() => calculateCurrentMacros(meals), [meals, calculateCurrentMacros]);

  // Animation state for progress bars
  const [animatedPercentages, setAnimatedPercentages] = useState<number[]>([]);

  const macroDisplay = useMemo(() => {
    const calculateProgress = (current: number, target: number) => {
      if (!target || target <= 0) return 0;
      return Math.min((current / target) * 100, 100);
    };

    const caloriesProgress = calculateProgress(currentMacros.calories, macros?.calories || 0);
    const proteinProgress = calculateProgress(currentMacros.protein_g, macros?.protein_g || 0);
    const carbsProgress = calculateProgress(currentMacros.carbs_g, macros?.carbs_g || 0);
    const fatsProgress = calculateProgress(currentMacros.fats_g, macros?.fats_g || 0);

    return [
      {
        label: 'Calories',
        color: 'bg-[#3B82F6]',
        track: 'bg-[#374151]',
        current: currentMacros.calories,
        target: macros?.calories || 0,
        val: `${currentMacros.calories} / ${macros?.calories || 0} kcal`,
        percentage: caloriesProgress,
        animatedPercentage: animatedPercentages[0] || 0
      },
      {
        label: 'Protein',
        color: 'bg-[#22C55E]',
        track: 'bg-[#374151]',
        current: currentMacros.protein_g,
        target: macros?.protein_g || 0,
        val: `${currentMacros.protein_g} / ${macros?.protein_g || 0}g`,
        percentage: proteinProgress,
        animatedPercentage: animatedPercentages[1] || 0
      },
      {
        label: 'Carbs',
        color: 'bg-[#F97316]',
        track: 'bg-[#374151]',
        current: currentMacros.carbs_g,
        target: macros?.carbs_g || 0,
        val: `${currentMacros.carbs_g} / ${macros?.carbs_g || 0}g`,
        percentage: carbsProgress,
        animatedPercentage: animatedPercentages[2] || 0
      },
      {
        label: 'Fats',
        color: 'bg-[#EAB308]',
        track: 'bg-[#374151]',
        current: currentMacros.fats_g,
        target: macros?.fats_g || 0,
        val: `${currentMacros.fats_g} / ${macros?.fats_g || 0}g`,
        percentage: fatsProgress,
        animatedPercentage: animatedPercentages[3] || 0
      },
    ];
  }, [currentMacros, macros]); // Remove animatedPercentages dependency

  // Update animated percentages when current macros change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentMacros && Object.values(currentMacros).some(v => v > 0)) {
        const newPercentages = [
          Math.min((currentMacros.calories / (macros?.calories || 1)) * 100, 100),
          Math.min((currentMacros.protein_g / (macros?.protein_g || 1)) * 100, 100),
          Math.min((currentMacros.carbs_g / (macros?.carbs_g || 1)) * 100, 100),
          Math.min((currentMacros.fats_g / (macros?.fats_g || 1)) * 100, 100),
        ].map(p => Math.max(0, p)); // Ensure no negative values

        setAnimatedPercentages(newPercentages);
      }
    }, 100); // Small delay for smooth animation

    return () => clearTimeout(timer);
  }, [currentMacros, macros]);

  const {
    mealSlots,
    snackSlots,
    mealsTarget,
    snacksTarget,
    mealsLogged,
    snacksLogged,
  } = useMemo(() => {
    const countCalories = (entry?: MealLog | null) => {
      if (!entry) return 0;
      return (entry.items || []).reduce((sum, it) => sum + (it.calories || 0), 0);
    };

    const formatLabel = (value: string | undefined | null, fallback: string) => {
      if (!value) return fallback;
      const cleaned = value.replace(/_/g, ' ').trim();
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    };

    const profileMealsTarget = Math.max(0, nutritionProfile?.meals_per_day ?? agentPlan?.plan?.length ?? 0);
    const profileSnacksTarget = Math.max(0, nutritionProfile?.snacks_per_day ?? agentPlan?.snacks?.length ?? 0);

    const sortedMeals = [...meals].sort((a, b) => {
      const aTime = new Date(a.timestamp || '').getTime();
      const bTime = new Date(b.timestamp || '').getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return aTime - bTime;
    });

    const snackEntries = sortedMeals.filter(meal =>
      (meal.meal_type || '').toLowerCase().includes('snack')
    );
    const primaryMeals = sortedMeals.filter(meal =>
      !(meal.meal_type || '').toLowerCase().includes('snack')
    );

    const planMeals = agentPlan?.plan || [];
    const planSnacks = agentPlan?.snacks || [];

    const buildSlots = (entries: MealLog[], planEntries: AgentPlan[], total: number, fallbackPrefix: string) => {
      const limit = Math.max(total, entries.length, planEntries.length);
      const slots: Array<{ label: string; title: string; kcal: number; logged: boolean; plan?: AgentPlan }> = [];
      for (let i = 0; i < limit; i += 1) {
        const entry = entries[i];
        const planEntry = planEntries[i];
        const fallbackLabel = planEntry?.meal_type || `${fallbackPrefix} ${i + 1}`;
        const label = formatLabel(entry?.meal_type || planEntry?.meal_type, fallbackLabel);
        const title = entry
          ? entry.items?.[0]?.name || entry.notes || planEntry?.title || label
          : planEntry?.title || fallbackLabel;
        const calories = entry ? countCalories(entry) : planEntry?.calories || 0;
        slots.push({
          label,
          title,
          kcal: calories,
          logged: Boolean(entry),
          plan: planEntry,
        });
      }
      return slots;
    };

    return {
      mealSlots: buildSlots(primaryMeals, planMeals, profileMealsTarget, 'Meal'),
      snackSlots: buildSlots(snackEntries, planSnacks, profileSnacksTarget, 'Snack'),
      mealsTarget: profileMealsTarget,
      snacksTarget: profileSnacksTarget,
      mealsLogged: primaryMeals.length,
      snacksLogged: snackEntries.length,
    };
  }, [meals, nutritionProfile, agentPlan]);

  const mealPlanSummary = useMemo(() => {
    const entries = mealSlots.map(slot => {
      const mac = slot.plan ? {
        calories: slot.plan.calories || 0,
        protein_g: slot.plan.protein_g || 0,
        carbs_g: slot.plan.carbs_g || 0,
        fats_g: slot.plan.fats_g || 0,
      } : null;
      return { label: slot.label, logged: slot.logged, plan: mac };
    });
    return entries;
  }, [mealSlots]);

  const handleAddWater = async (amount: number) => {
    try {
      // Optimistically update UI immediately
      setWaterMl(prev => prev + amount);
      
      // Make API call in background
      const result = await NutritionService.addWater(amount);
      
      // Update with actual value from server
      if (result && typeof result.total_ml === 'number') {
        setWaterMl(result.total_ml);
      }
    } catch (e) {
      console.error('Failed to add water', e);
      // Revert optimistic update on error
      const w = await NutritionService.waterToday().catch(() => ({ total_ml: waterMl }));
      setWaterMl(w.total_ml || waterMl);
    }
  };

  const handleLogMeal = useCallback(async (mealType: string, slotIndex?: number) => {
    // Only allow logging if plan exists, is valid, and is saved
    if (!agentPlan || (agentPlan.plan.length === 0 && agentPlan.snacks.length === 0)) {
      alert('Please generate a meal plan before logging meals.');
      return;
    }

    if (planState !== 'saved') {
      alert('Please save your meal plan before logging meals.');
      return;
    }

    try {
      // Determine if this is a snack or meal
      const isSnack = mealType.toLowerCase().includes('snack');
      const sourceArray = isSnack ? (agentPlan?.snacks || []) : (agentPlan?.plan || []);
      
      // Find the correct planned meal/snack
      let current: any = null;
      
      if (typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < sourceArray.length) {
        // Use provided index for accurate selection (critical for snacks)
        current = sourceArray[slotIndex];
      } else {
        // Fallback: find by meal_type match (works for meals like "Breakfast", "Lunch", "Dinner")
        current = (agentPlan?.plan || []).concat(agentPlan?.snacks || []).find(m =>
          (m.meal_type || '').toLowerCase() === (mealType || '').toLowerCase()
        );
      }

      if (!current) {
        console.error('No planned meal found for:', mealType, 'at index:', slotIndex);
        return;
      }

      // Optimistically update UI state to show as logged immediately
      const optimisticUpdate = () => {
        const today = new Date().toISOString().split('T')[0];
        const newMeal: MealLog = {
          id: `temp-${Date.now()}`,
          user_id: user?.id || '',
          meal_type: mealType,
          timestamp: new Date().toISOString(),
          items: [{
            name: current.title || mealType,
            calories: current.calories || 0,
            protein_g: current.protein_g || 0,
            carbs_g: current.carbs_g || 0,
            fats_g: current.fats_g || 0,
          }],
          notes: `Logged from planned meal: ${current.title}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setMeals(prev => [...prev, newMeal]);
      };

      // Apply optimistic update for instant feedback
      optimisticUpdate();

      // Log the meal with planned details (async in background)
      const logPromise = NutritionService.createMeal({
        meal_type: mealType,
        timestamp: new Date().toISOString(),
        items: [{
          name: current.title || mealType,
          calories: current.calories || 0,
          protein_g: current.protein_g || 0,
          carbs_g: current.carbs_g || 0,
          fats_g: current.fats_g || 0,
        }],
        notes: `Logged from planned meal: ${current.title}`,
      });

      // Refresh data in background
      logPromise.then(() => handleMealLogged()).catch((error) => {
        console.error('Failed to log meal:', error);
        alert('Failed to log meal. Please try again.');
        // Revert optimistic update on error
        handleMealLogged();
      });
    } catch (error) {
      console.error('Failed to log meal:', error);
      alert('Failed to log meal. Please try again.');
    }
  }, [agentPlan, planState, user]);

  const handleMealLogged = useCallback(async () => {
    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Refresh meals data - ONLY today's meals
      const mealsResp = await NutritionService.listMeals({ start: today, end: today });
      setMeals(mealsResp);

      // Refresh macros and water data (but don't override water goal - it's handled by agent plan)
      const [macrosResp, waterResp] = await Promise.all([
        NutritionService.getMacros(),
        NutritionService.waterToday(),
      ]);
      setMacros(macrosResp);
      setWaterMl(waterResp.total_ml || 0);
      // Water goal is managed by the agent plan, not by daily water tracking

      // Refresh progress data to update graphs and progress pages
      await ProgressService.refreshNutritionProgress();

      // Note: We don't need to refresh the agent plan after logging a meal
      // as the plan itself doesn't change when logging meals

      // Dispatch event to notify other components that meal was logged
      window.dispatchEvent(new CustomEvent('meal-logged', {
        detail: { timestamp: new Date() }
      }));
    } catch (error) {
      console.error('Failed to refresh data after meal logging:', error);
    }
  }, []);

  const handleDownloadCSV = async () => {
    try {
      // Only allow CSV download if plan is saved and has grocery items
      if (planState !== 'saved' || groceryItems.length === 0) {
        alert('Please save your meal plan first to generate a grocery list for CSV download.');
        return;
      }

      // Generate improved grocery list from current plan ingredients (for consistency with backend)
      const itemsFromPlan = (agentPlan?.plan || []).concat(agentPlan?.snacks || [])
        .flatMap(entry => entry?.ingredients || [])
        .map(item => item?.trim())
        .filter((item): item is string => Boolean(item));

      // Use the same logic as backend for generating practical grocery lists
      const aggregated = new Map<string, number>();

      itemsFromPlan.forEach(ingredient => {
        // Parse ingredient (simplified version of backend logic)
        const match = ingredient.match(/^(\d+(?:\.\d+)?)\s*(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|gram|grams|kg|kilogram|lb|pound|pounds|oz|ounce|ounces)\s+(.+)$/i);
        if (match) {
          const quantity = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          const item = match[3].trim();

          // Convert to standard units (simplified)
          let standardQuantity = quantity;
          if (unit.includes('cup')) standardQuantity *= 240;
          else if (unit.includes('tbsp') || unit.includes('tablespoon')) standardQuantity *= 15;
          else if (unit.includes('tsp') || unit.includes('teaspoon')) standardQuantity *= 5;
          else if (unit.includes('kg') || unit.includes('kilogram')) standardQuantity *= 1000;
          else if (unit.includes('lb') || unit.includes('pound')) standardQuantity *= 454;
          else if (unit.includes('oz') || unit.includes('ounce')) standardQuantity *= 28;

          const cleanItem = item.replace(/\b(grilled|cooked|raw|fresh|dried|chopped|sliced|diced)\b/gi, '').trim();
          aggregated.set(cleanItem, (aggregated.get(cleanItem) || 0) + standardQuantity);
        }
      });

      const items = Array.from(aggregated.entries())
        .map(([item, quantity]) => {
          if (quantity < 50) return `${item} (small amount)`;
          if (quantity < 200) return `${Math.round(quantity)}g ${item}`;
          if (quantity < 1000) return `${Math.round(quantity)}g ${item}`;
          return `${Math.round(quantity / 1000)}kg ${item}`;
        });

      if (items.length) {
        const csvRows = ['item,checked', ...items.map(item => `${item.replace(/,/g, ' ')},`)].join('\n');
        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'grocery_list.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        return;
      }

      // Fallback: use the current grocery items if no items were generated from plan
      if (groceryItems.length) {
        const csvRows = ['item,checked', ...groceryItems.map(item => `${item.replace(/,/g, ' ')},`)].join('\n');
        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'grocery_list.csv';
      a.click();
      window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to download grocery list', e);
    }
  };

  const handleDownloadPDF = () => {
    try {
      // Only allow PDF download if plan is saved and has grocery items
      if (planState !== 'saved' || groceryItems.length === 0) {
        alert('Please save your meal plan first to generate a grocery list for PDF download.');
        return;
      }

      const printableItems = groceryItems;

      // Create a new window for PDF generation
      const popup = window.open('', '_blank', 'width=720,height=900');
      if (!popup) {
        console.error('Popup blocked when trying to download PDF');
        return;
      }

      popup.document.write(`<!DOCTYPE html><html><head><title>Grocery List</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 20px; margin-bottom: 16px; }
          ul { list-style: disc; padding-left: 20px; }
          li { margin-bottom: 8px; }
        </style>
      </head><body>
        <h1>FluxWell Grocery List</h1>
        <ul>
          ${printableItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </body></html>`);
      popup.document.close();
      popup.focus();

      // Use CSS print media queries for better PDF formatting
      const style = popup.document.createElement('style');
      style.textContent = `
        @media print {
          body { font-size: 12px; }
          h1 { font-size: 18px; margin-bottom: 12px; }
          ul { padding-left: 15px; }
          li { margin-bottom: 6px; }
        }
      `;
      popup.document.head.appendChild(style);

      // Trigger print dialog for PDF creation
      popup.print();

      // Close the popup after a short delay to allow PDF creation
      setTimeout(() => {
        popup.close();
      }, 1000);
    } catch (e) {
      console.error('Failed to prepare PDF download', e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    navigate('/');
  };

  // Profile image logic: check social providers first, then form user onboarding data
  const profileImage = useMemo(() => {
    if (!user) return null;
    const provider = user.auth_provider;
    // For social login users (Google/Fitbit), use their profile picture
    if (provider === 'google' || provider === 'fitbit') {
      return user.profile_picture_url || null;
    }
    // For form users, use onboarding step1 profile picture
    if (provider === 'form') {
      return onboardingStep1?.profile_picture_url || null;
    }
    return null;
  }, [user, onboardingStep1]);
  
  const userInitial = (user?.full_name || '').trim().charAt(0).toUpperCase() || 'U';

  const totalTargets = mealsTarget + snacksTarget;
  const totalLogged = mealsLogged + snacksLogged;

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header (same as Dashboard) */}
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
            <Link to="/nutrition" className="text-[#EB4747] font-semibold">Nutrition</Link>
            <Link to="/realtime" className="text-gray-400 hover:text-white">Tracking</Link>
            <Link to="/coach" className="text-gray-400 hover:text-white">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
            <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
            <Link to="/practice" className="text-gray-400 hover:text-white">Practice Room</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10"
            >
              Logout
            </button>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {profileImage ? (
                <img src={profileImage} alt={user?.full_name || 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold">{userInitial}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 md:px-10 pt-[73px] pb-10">
        {/* Title */}
        <div className="mb-6 md:mb-10">
          <h1 className="text-2xl md:text-3xl font-extrabold">Nutrition</h1>
          <p className="text-sm md:text-base text-gray-400 mt-1">Plan, log, and optimize your meals.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left Column: Meal Logging, Macro Targets */}
          <div className="flex flex-col gap-8">
            {/* Meal Logging Card */}
            <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold">Meal Logging</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    {totalTargets > 0
                      ? `Logged ${totalLogged} of ${totalTargets} planned entries today`
                      : 'Configure your nutrition profile to personalise meal slots.'}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-400 space-y-1">
                  <div>Meals: {mealsTarget > 0 ? `${Math.min(mealsLogged, mealsTarget)}/${mealsTarget}` : mealsLogged > 0 ? `${mealsLogged}` : '—'}</div>
                  <div>Snacks: {snacksTarget > 0 ? `${Math.min(snacksLogged, snacksTarget)}/${snacksTarget}` : snacksLogged > 0 ? `${snacksLogged}` : '—'}</div>
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button
                      onClick={() => loadAgentPlan()}
                      className="px-3 py-1 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10"
                      disabled={isRefreshingPlan}
                    >
                      {isRefreshingPlan ? 'Updating…' : 'Refresh Plan'}
                    </button>
                    {planState === 'generated' && (
                      <button
                        onClick={savePlan}
                        disabled={isSavingPlan}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          isSavingPlan
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-[#EB4747] text-white hover:bg-[#D73737]'
                        }`}
                      >
                        {isSavingPlan ? 'Saving...' : 'Save Plan'}
                      </button>
                    )}
                    {planState !== 'saved' && (
                      <button
                        onClick={regeneratePlan}
                        className="px-3 py-1 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10"
                      >
                        Regenerate
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Meals Section */}
                {mealSlots.map((slot, idx) => (
                  <div key={`meal-${idx}`} className="grid grid-cols-[24px_2px_1fr] gap-4 items-start">
                    <div className="w-6 h-6 rounded-full bg-[#EB4747]/30 flex items-center justify-center">
                      <div className={`w-4 h-4 rounded-full ${slot.logged ? 'bg-[#EB4747]' : 'bg-white/20'}`} />
                    </div>
                    <div className="w-[2px] bg-[rgba(234,42,42,0.4)]" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-200">{slot.label}</h3>
                        <div className="flex items-center gap-2">
                          {slot.logged && (
                            <span className="text-xs text-green-400 font-medium">✓ Logged</span>
                          )}
                          <span className={`text-xs font-semibold ${slot.logged ? 'text-green-400' : 'text-gray-500'}`}>
                            {slot.logged ? '' : 'Planned'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 bg-[#211111] rounded-xl p-4 border border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold">{slot.title}</div>
                            <div className="text-xs text-gray-400 flex items-center gap-2">
                              <span>{slot.kcal ? `${slot.kcal} kcal` : slot.plan?.calories ? `${slot.plan.calories} kcal` : '—'}</span>
                              {slot.plan && (
                                <span className="text-gray-500">
                                  {slot.plan.protein_g ? `P${slot.plan.protein_g}g` : ''}
                                  {slot.plan.carbs_g ? ` · C${slot.plan.carbs_g}g` : ''}
                                  {slot.plan.fats_g ? ` · F${slot.plan.fats_g}g` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {planState === 'saved' && (
                              <button
                                onClick={() => handleLogMeal(slot.label, idx)}
                                disabled={slot.logged}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                                  slot.logged
                                    ? 'border-green-400/40 text-green-400 cursor-not-allowed'
                                    : 'border-[#EB4747]/40 text-gray-200 hover:bg-[#EB4747]/20'
                                }`}
                              >
                                {slot.logged ? '✓ Logged' : 'Log Meal'}
                              </button>
                            )}
                            {planState === 'generated' && slot.plan && (
                              <button
                                onClick={() => handleSwap(slot.label, idx)}
                                className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/30 text-gray-200 hover:bg-white/10"
                              >
                                Swap
                              </button>
                            )}
                            {slot.plan && (
                              <button
                                onClick={() => {
                                  setActiveRecipe({
                                    title: slot.plan?.title || slot.label,
                                    steps: slot.plan?.steps || [],
                                    ingredients: slot.plan?.ingredients || [],
                                  });
                                  setIsRecipeOpen(true);
                                }}
                                className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/30 text-gray-200 hover:bg-white/10"
                              >
                                Recipe
                              </button>
                            )}
                          </div>
                        </div>
                        {slot.plan?.ingredients && slot.plan.ingredients.length > 0 && (
                          <div className="text-xs text-gray-500">
                            <p className="font-semibold text-gray-300 mb-2">Ingredients</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-400">
                              {slot.plan.ingredients.map((ingredient, idx) => (
                                <li key={`ing-${idx}`} className="text-xs">{ingredient}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {slot.plan?.steps && slot.plan.steps.length > 0 && (
                          <div className="text-xs text-gray-500">
                            <p className="font-semibold text-gray-300 mb-2">Directions</p>
                            <ol className="list-decimal list-inside space-y-1 text-gray-400">
                              {slot.plan.steps.map((step, idx) => (
                                <li key={`step-${idx}`} className="text-xs">{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Snacks Section */}
                {snackSlots.length > 0 && (
                  <div className="pt-4 border-t border-white/10 space-y-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Snacks</p>
                    {snackSlots.map((slot, idx) => (
                      <div key={`snack-${idx}`} className="grid grid-cols-[24px_2px_1fr] gap-4 items-start">
                        <div className="w-6 h-6 rounded-full bg-[#06B6D4]/20 flex items-center justify-center">
                          <div className={`w-4 h-4 rounded-full ${slot.logged ? 'bg-[#06B6D4]' : 'bg-white/20'}`} />
                        </div>
                        <div className="w-[2px] bg-[rgba(6,182,212,0.3)]" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-200">{slot.label}</h3>
                            <div className="flex items-center gap-2">
                              {slot.logged && (
                                <span className="text-xs text-green-400 font-medium">✓ Logged</span>
                              )}
                              <span className={`text-xs font-semibold ${slot.logged ? 'text-green-400' : 'text-gray-500'}`}>
                                {slot.logged ? '' : 'Planned'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 bg-[#102226] rounded-xl p-4 border border-white/10">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-bold">{slot.title}</div>
                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                  <span>{slot.kcal ? `${slot.kcal} kcal` : slot.plan?.calories ? `${slot.plan.calories} kcal` : '—'}</span>
                                  {slot.plan && (
                                    <span className="text-gray-500">
                                      {slot.plan.protein_g ? `P${slot.plan.protein_g}g` : ''}
                                      {slot.plan.carbs_g ? ` · C${slot.plan.carbs_g}g` : ''}
                                      {slot.plan.fats_g ? ` · F${slot.plan.fats_g}g` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {planState === 'saved' && (
                                  <button
                                    onClick={() => handleLogMeal(slot.label, idx)}
                                    disabled={slot.logged}
                                    className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                                      slot.logged
                                        ? 'border-green-400/40 text-green-400 cursor-not-allowed'
                                        : 'border-[#06B6D4]/40 text-gray-200 hover:bg-[#06B6D4]/20'
                                    }`}
                                  >
                                    {slot.logged ? '✓ Logged' : 'Log Snack'}
                                  </button>
                                )}
                                {planState === 'generated' && slot.plan && (
                                  <button
                                    onClick={() => handleSwap(slot.label, idx)}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/30 text-gray-200 hover:bg-white/10"
                                  >
                                    Swap
                                  </button>
                                )}
                                {slot.plan && (
                                  <button
                                    onClick={() => {
                                      setActiveRecipe({
                                        title: slot.plan?.title || slot.label,
                                        steps: slot.plan?.steps || [],
                                        ingredients: slot.plan?.ingredients || [],
                                      });
                                      setIsRecipeOpen(true);
                                    }}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/30 text-gray-200 hover:bg-white/10"
                                  >
                                    Recipe
                                  </button>
                                )}
                              </div>
                            </div>
                            {slot.plan?.ingredients && slot.plan.ingredients.length > 0 && (
                              <div className="text-xs text-gray-500">
                                <p className="font-semibold text-gray-300 mb-2">Ingredients</p>
                                <ul className="list-disc list-inside space-y-1 text-gray-400">
                                  {slot.plan.ingredients.map((ingredient, idx) => (
                                    <li key={`ing-${idx}`} className="text-xs">{ingredient}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {slot.plan?.steps && slot.plan.steps.length > 0 && (
                              <div className="text-xs text-gray-500">
                                <p className="font-semibold text-gray-300 mb-2">Directions</p>
                                <ol className="list-decimal list-inside space-y-1 text-gray-400">
                                  {slot.plan.steps.map((step, idx) => (
                                    <li key={`step-${idx}`} className="text-xs">{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Macro Targets Card */}
            <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <h2 className="text-2xl font-bold mb-4">Macro Progress</h2>
              <div className="space-y-6">
                {macroDisplay.map(m => (
                  <div key={m.label} className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 font-medium">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">
                          {m.current} / {m.target || 0} {m.label === 'Calories' ? 'kcal' : 'g'}
                        </span>
                        <span className={`text-xs font-semibold ${
                          m.percentage >= 100 ? 'text-green-400' :
                          m.percentage >= 80 ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}>
                          {m.percentage.toFixed(0)}%
                        </span>
                    </div>
                    </div>
                    <div className="relative">
                      <div className={`w-full h-3 rounded-full ${m.track} overflow-hidden`}>
                        <div
                          className={`h-full rounded-full ${m.color} transition-all duration-500 ease-out`}
                          style={{ width: `${m.animatedPercentage || 0}%` }}
                        />
                      </div>
                      {m.animatedPercentage > 100 && (
                        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse" />
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>0</span>
                      <span>{m.target || 0} {m.label === 'Calories' ? 'kcal' : 'g'}</span>
                    </div>
                  </div>
                ))}

                {planMacros && (
                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Today's Plan Summary</p>
                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-300">
                      <div className="p-3 rounded-lg border border-white/10 bg-black/10">
                        <p className="text-gray-500 uppercase tracking-wide text-[10px]">Plan Calories</p>
                        <p className="text-sm font-semibold text-gray-100">{planMacros.calories ? `${planMacros.calories.toFixed(0)} kcal` : '—'}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-white/10 bg-black/10">
                        <p className="text-gray-500 uppercase tracking-wide text-[10px]">Plan Protein</p>
                        <p className="text-sm font-semibold text-gray-100">{planMacros.protein_g ? `${planMacros.protein_g.toFixed(0)} g` : '—'}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-white/10 bg-black/10">
                        <p className="text-gray-500 uppercase tracking-wide text-[10px]">Plan Carbs</p>
                        <p className="text-sm font-semibold text-gray-100">{planMacros.carbs_g ? `${planMacros.carbs_g.toFixed(0)} g` : '—'}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-white/10 bg-black/10">
                        <p className="text-gray-500 uppercase tracking-wide text-[10px]">Plan Fats</p>
                        <p className="text-sm font-semibold text-gray-100">{planMacros.fats_g ? `${planMacros.fats_g.toFixed(0)} g` : '—'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-gray-400 mb-3">Daily Progress Overview</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg border border-white/10 bg-black/10">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Total Logged</p>
                      <p className="text-lg font-bold text-gray-100">{meals.length}</p>
                      <p className="text-xs text-gray-400">meals today</p>
                        </div>
                    <div className="text-center p-3 rounded-lg border border-white/10 bg-black/10">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Avg. Progress</p>
                      <p className="text-lg font-bold text-gray-100">
                        {macroDisplay.length > 0
                          ? Math.round(macroDisplay.reduce((sum, m) => sum + (m.animatedPercentage || 0), 0) / macroDisplay.length)
                          : 0}%
                      </p>
                      <p className="text-xs text-gray-400">towards targets</p>
                      </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Water Intake, Grocery List */}
          <div className="flex flex-col gap-8">
            {/* Water Intake Card */}
            <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <h2 className="text-2xl font-bold mb-4">Water Intake</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="flex flex-col items-center">
                  <div className="relative w-48 h-48">
                    <svg viewBox="0 0 100 100" className="absolute inset-0">
                      <circle cx="50" cy="50" r="40" stroke="rgba(6,182,212,0.2)" strokeWidth="16" fill="none" />
                      {
                        (() => {
                          const circumference = 2 * Math.PI * 40;
                          const ratio = Math.max(0, Math.min(1, waterMl / waterGoalMl));
                          const dash = `${Math.round(circumference * ratio)} ${Math.round(circumference)}`;
                          return (<circle cx="50" cy="50" r="40" stroke="#06B6D4" strokeWidth="16" fill="none" strokeDasharray={dash} />);
                        })()
                      }
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-3xl font-extrabold text-[#06B6D4]">{(waterMl/1000).toFixed(1)}L</div>
                      <div className="text-sm text-gray-400">of {(waterGoalMl/1000).toFixed(0)}L goal</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center gap-3">
                  <button className="px-4 py-2 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10" onClick={() => handleAddWater(250)}>+250ml</button>
                  <button className="px-4 py-2 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10" onClick={() => handleAddWater(500)}>+500ml</button>
                </div>
              </div>
            </section>

            {/* Grocery List Card */}
            <section className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
              <h2 className="text-2xl font-bold mb-4">Grocery List</h2>
              <div className="space-y-3">
                {planState === 'saved' && groceryItems.length > 0 ? (
                  groceryItems.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded border border-white/10 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded bg-[#EB4747]" />
                    </div>
                    <div className="text-sm text-gray-300">{item}</div>
                  </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400 italic py-4 text-center">
                    Grocery list will be generated after saving your meal plan
              </div>
                )}
              </div>
              {planState === 'saved' && groceryItems.length > 0 && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <button className="px-4 py-2 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10" onClick={handleDownloadCSV}>Download CSV</button>
                <button className="px-4 py-2 rounded-lg border border-white/30 text-gray-200 hover:bg-white/10" onClick={handleDownloadPDF}>Download PDF</button>
              </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {isRecipeOpen && activeRecipe && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-xl bg-[#1E1E1E] border border-white/10 rounded-2xl shadow-xl p-6 relative">
            <button
              onClick={() => setIsRecipeOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-xl font-bold mb-3">{activeRecipe.title}</h3>
            <div className="space-y-4 text-sm text-gray-300">
              {activeRecipe.ingredients.length > 0 && (
                <div>
                  <p className="uppercase text-xs text-gray-500 tracking-wide mb-2">Ingredients</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-200">
                    {activeRecipe.ingredients.map((item, idx) => (
                      <li key={`ing-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {activeRecipe.steps.length > 0 && (
                <div>
                  <p className="uppercase text-xs text-gray-500 tracking-wide mb-2">Directions</p>
                  <ol className="list-decimal list-outside ml-5 space-y-2 text-gray-200">
                    {activeRecipe.steps.map((step, idx) => (
                      <li key={`step-${idx}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setIsRecipeOpen(false)}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm text-gray-300 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {swapContext.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-white/10 rounded-2xl shadow-xl p-6 relative">
            <button
              onClick={() => setSwapContext({ open: false, options: [] })}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
            <h3 className="text-lg font-bold mb-1">Swap {swapContext.mealType}</h3>
            <p className="text-xs text-gray-400 mb-4">Choose an alternative{swapContext.kcal ? ` around ${swapContext.kcal} kcal` : ''}.</p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {swapContext.options.length === 0 && (
                <div className="text-sm text-gray-400 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                  <p className="font-medium text-yellow-400">Unable to generate alternatives</p>
                  <p className="text-sm text-gray-300 mt-1">Please try regenerating your meal plan for better variety.</p>
                </div>
              )}
              {swapContext.options.map((opt, idx) => {
                const alternative = swapContext.alternatives?.[idx];
                return (
                  <div key={`opt-${idx}`} className="bg-black/20 border border-white/10 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-200">{opt}</h4>
                        {alternative && (
                          <div className="text-xs text-gray-400 mt-1">
                            <span className="text-blue-400">{alternative.calories} kcal</span>
                            <span className="mx-2">•</span>
                            <span>P{alternative.protein_g}g C{alternative.carbs_g}g F{alternative.fats_g}g</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => confirmSwap(opt)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/30 text-gray-200 hover:bg-white/10 ml-2"
                      >
                        Choose
                      </button>
                    </div>
                    {alternative && alternative.ingredients && (
                      <div className="text-xs text-gray-500 mt-2">
                        <p className="font-semibold text-gray-300 mb-1">Ingredients</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                          {alternative.ingredients.slice(0, 3).map((ingredient: string, i: number) => (
                            <li key={i} className="text-xs">{ingredient}</li>
                          ))}
                          {alternative.ingredients.length > 3 && (
                            <li className="text-xs text-gray-500">+{alternative.ingredients.length - 3} more...</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSwapContext({ open: false, options: [], alternatives: [] })}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm text-gray-300 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


