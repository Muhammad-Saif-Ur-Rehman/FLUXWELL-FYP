import React from 'react';

interface WorkoutCompletionChartProps {
  completionRate: number;
  totalWorkouts: number;
  completedWorkouts: number;
  weeklyData: Array<{
    day: string;
    completed: boolean;
    planned: boolean;
  }>;
}

export default function WorkoutCompletionChart({ 
  completionRate, 
  totalWorkouts, 
  completedWorkouts, 
  weeklyData 
}: WorkoutCompletionChartProps) {
  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {completionRate}%
          </div>
          <div className="text-sm text-gray-400">
            {completedWorkouts} of {totalWorkouts} workouts
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">This Week</div>
          <div className="text-lg font-semibold text-white">
            {weeklyData.filter(d => d.completed).length}/{weeklyData.filter(d => d.planned).length}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Progress</span>
          <span>{completionRate}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#EB4747] to-[#FF6B6B] transition-all duration-500 ease-out"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Weekly Heatmap */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">This Week</div>
        <div className="grid grid-cols-7 gap-1">
          {weeklyData.map((day, index) => (
            <div key={index} className="space-y-1">
              <div className="text-xs text-gray-500 text-center">
                {day.day.slice(0, 3)}
              </div>
              <div 
                className={`w-full h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  day.completed 
                    ? 'bg-green-500 text-white' 
                    : day.planned 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'bg-white/5 text-gray-500'
                }`}
              >
                {day.completed ? '✓' : day.planned ? '✗' : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
