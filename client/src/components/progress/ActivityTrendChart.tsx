import React from 'react';

interface ActivityTrendChartProps {
  currentSteps: number;
  dailyGoal: number;
  weeklyData: Array<{
    date: string;
    steps: number;
    calories: number;
    distance: number;
  }>;
}

export default function ActivityTrendChart({ 
  currentSteps, 
  dailyGoal, 
  weeklyData 
}: ActivityTrendChartProps) {
  const weeklySteps = weeklyData.reduce((sum, day) => sum + day.steps, 0);
  const weeklyCalories = weeklyData.reduce((sum, day) => sum + day.calories, 0);
  const weeklyDistance = weeklyData.reduce((sum, day) => sum + day.distance, 0);
  const averageSteps = weeklyData.length > 0 ? Math.round(weeklySteps / weeklyData.length) : 0;
  const goalAchievement = dailyGoal > 0 ? Math.round((currentSteps / dailyGoal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {currentSteps.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">
            of {dailyGoal.toLocaleString()} steps
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Goal</div>
          <div className="text-lg font-semibold text-white">
            {goalAchievement}%
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Daily Progress</span>
          <span>{goalAchievement}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(goalAchievement, 100)}%` }}
          />
        </div>
      </div>

      {/* Weekly Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {averageSteps.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400">Avg Steps</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {weeklyCalories.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400">Calories</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {weeklyDistance.toFixed(1)}
          </div>
          <div className="text-xs text-gray-400">km</div>
        </div>
      </div>

      {/* Steps Chart */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">7-Day Steps</div>
        <div className="flex items-end gap-1 h-16">
          {weeklyData.map((day, index) => {
            const dayPercentage = dailyGoal > 0 ? (day.steps / dailyGoal) * 100 : 0;
            const height = Math.max(8, (dayPercentage / 100) * 48);
            const isGoalMet = day.steps >= dailyGoal;
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t transition-all duration-300 ${
                    isGoalMet 
                      ? 'bg-gradient-to-t from-green-500 to-green-400' 
                      : 'bg-gradient-to-t from-blue-500 to-blue-400'
                  }`}
                  style={{ height: `${height}px` }}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(day.date).getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Goal Status */}
      <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5">
        <div className={`w-2 h-2 rounded-full ${goalAchievement >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-sm text-gray-300">
          {goalAchievement >= 100 ? 'Goal achieved!' : `${dailyGoal - currentSteps} steps to go`}
        </span>
      </div>
    </div>
  );
}
