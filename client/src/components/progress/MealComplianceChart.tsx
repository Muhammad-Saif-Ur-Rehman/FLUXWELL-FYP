import React from 'react';

interface MealComplianceChartProps {
  complianceRate: number;
  totalMeals: number;
  compliantMeals: number;
  dailyData: Array<{
    date: string;
    meals: Array<{
      name: string;
      planned: boolean;
      followed: boolean;
      time: string;
    }>;
  }>;
}

export default function MealComplianceChart({ 
  complianceRate, 
  totalMeals, 
  compliantMeals, 
  dailyData 
}: MealComplianceChartProps) {
  const recentDays = dailyData.slice(-7);
  const streakDays = recentDays.filter(day => 
    day.meals.every(meal => !meal.planned || meal.followed)
  ).length;

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {complianceRate}%
          </div>
          <div className="text-sm text-gray-400">
            {compliantMeals} of {totalMeals} meals
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Streak</div>
          <div className="text-lg font-semibold text-white">
            {streakDays} days
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Compliance</span>
          <span>{complianceRate}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#EB4747] to-[#FF6B6B] transition-all duration-500 ease-out"
            style={{ width: `${complianceRate}%` }}
          />
        </div>
      </div>

      {/* Daily Meal Log */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">Recent Meals</div>
        <div className="space-y-1">
          {recentDays.slice(-3).map((day, dayIndex) => (
            <div key={dayIndex} className="space-y-1">
              <div className="text-xs text-gray-500">
                {new Date(day.date).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
              <div className="flex gap-1">
                {day.meals.map((meal, mealIndex) => (
                  <div 
                    key={mealIndex}
                    className={`flex-1 h-6 rounded flex items-center justify-center text-xs font-semibold ${
                      meal.followed 
                        ? 'bg-green-500 text-white' 
                        : meal.planned 
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                        : 'bg-white/5 text-gray-500'
                    }`}
                    title={`${meal.name} at ${meal.time}`}
                  >
                    {meal.followed ? '✓' : meal.planned ? '✗' : '—'}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Streak Indicator */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div 
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < streakDays 
                  ? 'bg-green-500' 
                  : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {streakDays === 7 ? 'Perfect week!' : `${streakDays} day streak`}
        </span>
      </div>
    </div>
  );
}
