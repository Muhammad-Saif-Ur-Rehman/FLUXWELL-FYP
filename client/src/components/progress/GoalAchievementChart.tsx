import React from 'react';

interface Goal {
  id: string;
  title: string;
  target: number;
  current: number;
  deadline: string;
  completed: boolean;
  category: 'fitness' | 'nutrition' | 'health' | 'lifestyle';
}

interface GoalAchievementChartProps {
  goals: Goal[];
  achievementRate: number;
  completedGoals: number;
  totalGoals: number;
}

export default function GoalAchievementChart({ 
  goals, 
  achievementRate, 
  completedGoals, 
  totalGoals 
}: GoalAchievementChartProps) {
  const categoryColors = {
    fitness: 'from-red-500 to-red-600',
    nutrition: 'from-green-500 to-green-600',
    health: 'from-blue-500 to-blue-600',
    lifestyle: 'from-purple-500 to-purple-600'
  };

  const categoryIcons = {
    fitness: '💪',
    nutrition: '🥗',
    health: '❤️',
    lifestyle: '🌟'
  };

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {achievementRate}%
          </div>
          <div className="text-sm text-gray-400">
            {completedGoals} of {totalGoals} goals
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">This Month</div>
          <div className="text-lg font-semibold text-white">
            {goals.filter(g => g.completed).length}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Overall Progress</span>
          <span>{achievementRate}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#EB4747] to-[#FF6B6B] transition-all duration-500 ease-out"
            style={{ width: `${achievementRate}%` }}
          />
        </div>
      </div>

      {/* Goals List */}
      <div className="space-y-3">
        {goals.slice(0, 4).map((goal) => {
          const progress = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
          const isOverdue = new Date(goal.deadline) < new Date() && !goal.completed;
          
          return (
            <div key={goal.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{categoryIcons[goal.category]}</span>
                  <span className="text-sm font-medium text-gray-300 truncate">
                    {goal.title}
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {goal.completed ? '✓' : `${Math.round(progress)}%`}
                </div>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out bg-gradient-to-r ${
                    goal.completed 
                      ? 'from-green-500 to-green-600' 
                      : isOverdue 
                      ? 'from-red-500 to-red-600' 
                      : categoryColors[goal.category]
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              {isOverdue && (
                <div className="text-xs text-red-400">
                  Overdue by {Math.ceil((new Date().getTime() - new Date(goal.deadline).getTime()) / (1000 * 60 * 60 * 24))} days
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Category Breakdown */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">By Category</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(categoryIcons).map(([category, icon]) => {
            const categoryGoals = goals.filter(g => g.category === category);
            const categoryCompleted = categoryGoals.filter(g => g.completed).length;
            const categoryRate = categoryGoals.length > 0 ? Math.round((categoryCompleted / categoryGoals.length) * 100) : 0;
            
            return (
              <div key={category} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                <span className="text-sm">{icon}</span>
                <div className="flex-1">
                  <div className="text-xs text-gray-300 capitalize">{category}</div>
                  <div className="text-xs text-gray-400">{categoryCompleted}/{categoryGoals.length}</div>
                </div>
                <div className="text-xs font-semibold text-white">{categoryRate}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
