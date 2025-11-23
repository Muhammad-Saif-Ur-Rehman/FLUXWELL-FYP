import React from 'react';

interface CalorieChartProps {
  consumed: number;
  recommended: number;
  dailyData: Array<{
    date: string;
    consumed: number;
    recommended: number;
  }>;
}

export default function CalorieChart({ consumed, recommended, dailyData }: CalorieChartProps) {
  const percentage = recommended > 0 ? Math.round((consumed / recommended) * 100) : 0;
  const isOver = consumed > recommended;
  const deficit = recommended - consumed;

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {consumed.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">
            of {recommended.toLocaleString()} kcal
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-semibold ${isOver ? 'text-red-400' : 'text-green-400'}`}>
            {isOver ? `+${Math.abs(deficit)}` : `-${deficit}`}
          </div>
          <div className="text-xs text-gray-400">
            {isOver ? 'over' : 'under'} target
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
            className={`h-full transition-all duration-500 ease-out ${
              isOver 
                ? 'bg-gradient-to-r from-red-500 to-red-600' 
                : 'bg-gradient-to-r from-green-500 to-green-600'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
          {isOver && (
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-red-700"
              style={{ width: `${Math.min((percentage - 100) * 0.5, 20)}%` }}
            />
          )}
        </div>
      </div>

      {/* Mini Chart */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">7-Day Trend</div>
        <div className="flex items-end gap-1 h-16">
          {dailyData.slice(-7).map((day, index) => {
            const dayPercentage = day.recommended > 0 ? (day.consumed / day.recommended) * 100 : 0;
            const height = Math.max(8, (dayPercentage / 100) * 48);
            const isOverDay = day.consumed > day.recommended;
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t transition-all duration-300 ${
                    isOverDay 
                      ? 'bg-gradient-to-t from-red-500 to-red-400' 
                      : 'bg-gradient-to-t from-green-500 to-green-400'
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
    </div>
  );
}
