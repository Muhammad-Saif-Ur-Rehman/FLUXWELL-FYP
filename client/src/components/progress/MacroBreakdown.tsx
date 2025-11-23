import React from 'react';

interface MacroData {
  protein: { consumed: number; target: number; color: string };
  carbs: { consumed: number; target: number; color: string };
  fats: { consumed: number; target: number; color: string };
}

interface MacroBreakdownProps {
  macros: MacroData;
  dailyData: Array<{
    date: string;
    protein: number;
    carbs: number;
    fats: number;
  }>;
}

export default function MacroBreakdown({ macros, dailyData }: MacroBreakdownProps) {
  const totalConsumed = macros.protein.consumed + macros.carbs.consumed + macros.fats.consumed;
  const totalTarget = macros.protein.target + macros.carbs.target + macros.fats.target;

  const macroItems = [
    { key: 'protein', label: 'Protein', data: macros.protein, icon: '🥩' },
    { key: 'carbs', label: 'Carbs', data: macros.carbs, icon: '🍞' },
    { key: 'fats', label: 'Fats', data: macros.fats, icon: '🥑' }
  ];

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {totalConsumed.toFixed(0)}g
          </div>
          <div className="text-sm text-gray-400">
            of {totalTarget.toFixed(0)}g total
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Today</div>
          <div className="text-lg font-semibold text-white">
            {Math.round((totalConsumed / totalTarget) * 100)}%
          </div>
        </div>
      </div>

      {/* Macro Breakdown */}
      <div className="space-y-3">
        {macroItems.map(({ key, label, data, icon }) => {
          const percentage = data.target > 0 ? (data.consumed / data.target) * 100 : 0;
          const isOver = data.consumed > data.target;
          
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{icon}</span>
                  <span className="text-sm font-medium text-gray-300">{label}</span>
                </div>
                <div className="text-sm text-gray-400">
                  {data.consumed.toFixed(0)}/{data.target.toFixed(0)}g
                </div>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${data.color}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
                {isOver && (
                  <div 
                    className="h-full bg-red-500/50"
                    style={{ width: `${Math.min((percentage - 100) * 0.3, 10)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini Chart */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">7-Day Average</div>
        <div className="flex items-end gap-1 h-12">
          {dailyData.slice(-7).map((day, index) => {
            const dayTotal = day.protein + day.carbs + day.fats;
            const dayPercentage = totalTarget > 0 ? (dayTotal / totalTarget) * 100 : 0;
            const height = Math.max(6, (dayPercentage / 100) * 36);
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-300"
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
