import React from 'react';

interface HydrationData {
  date: string;
  consumed: number; // ml
  target: number; // ml
  bottles: number;
  reminders: number;
}

interface HydrationTrendsProps {
  currentIntake: number;
  dailyTarget: number;
  hydrationData: HydrationData[];
  weeklyAverage: number;
}

export default function HydrationTrends({ 
  currentIntake, 
  dailyTarget, 
  hydrationData, 
  weeklyAverage 
}: HydrationTrendsProps) {
  const recentData = hydrationData.slice(-7);
  const percentage = dailyTarget > 0 ? Math.round((currentIntake / dailyTarget) * 100) : 0;
  const isOnTrack = percentage >= 80;
  const remaining = Math.max(0, dailyTarget - currentIntake);

  const getHydrationColor = (percentage: number) => {
    if (percentage >= 100) return 'from-green-500 to-green-600';
    if (percentage >= 80) return 'from-blue-500 to-blue-600';
    if (percentage >= 60) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  const getHydrationLabel = (percentage: number) => {
    if (percentage >= 100) return 'Excellent';
    if (percentage >= 80) return 'Good';
    if (percentage >= 60) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {currentIntake.toLocaleString()}ml
          </div>
          <div className="text-sm text-gray-400">
            of {dailyTarget.toLocaleString()}ml
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Status</div>
          <div className={`text-lg font-semibold ${
            percentage >= 100 ? 'text-green-400' :
            percentage >= 80 ? 'text-blue-400' :
            percentage >= 60 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {getHydrationLabel(percentage)}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Daily Intake</span>
          <span>{percentage}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${getHydrationColor(percentage)} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/5 text-center">
          <div className="text-lg font-bold text-white">
            {Math.round(weeklyAverage).toLocaleString()}
          </div>
          <div className="text-xs text-gray-400">Avg Daily</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 text-center">
          <div className="text-lg font-bold text-white">
            {Math.round(currentIntake / 500)}
          </div>
          <div className="text-xs text-gray-400">Bottles</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 text-center">
          <div className="text-lg font-bold text-white">
            {Math.round(remaining / 1000)}L
          </div>
          <div className="text-xs text-gray-400">Remaining</div>
        </div>
      </div>

      {/* Hydration Chart */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">7-Day Hydration</div>
        <div className="flex items-end gap-1 h-16">
          {recentData.map((day, index) => {
            const dayPercentage = day.target > 0 ? (day.consumed / day.target) * 100 : 0;
            const height = Math.max(8, (dayPercentage / 100) * 48);
            const isGoalMet = day.consumed >= day.target;
            
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

      {/* Hydration Tips */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">Today's Progress</div>
        <div className="space-y-2">
          {(() => {
            const bottles = Math.floor(currentIntake / 500);
            const remainingBottles = Math.ceil(remaining / 500);
            
            return (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: Math.max(bottles, remainingBottles) }, (_, i) => (
                      <div 
                        key={i}
                        className={`w-3 h-3 rounded-full ${
                          i < bottles ? 'bg-blue-500' : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-300">
                    {bottles} bottles consumed
                  </span>
                </div>
                
                {remaining > 0 && (
                  <div className="text-xs text-gray-400">
                    {remainingBottles} more bottles to reach your goal
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5">
        <div className={`w-2 h-2 rounded-full ${
          isOnTrack ? 'bg-green-500' : 'bg-yellow-500'
        }`} />
        <span className="text-sm text-gray-300">
          {isOnTrack 
            ? 'Great hydration today!' 
            : `${Math.round(remaining / 1000)}L more to reach your goal`
          }
        </span>
      </div>
    </div>
  );
}
