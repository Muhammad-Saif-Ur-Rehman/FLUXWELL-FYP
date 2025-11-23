import React from 'react';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface Streak {
  type: 'workout' | 'nutrition' | 'logging' | 'general';
  current: number;
  longest: number;
  lastActivity: string;
}

interface BadgesAndStreaksProps {
  badges: Badge[];
  streaks: Streak[];
  totalBadges: number;
  unlockedBadges: number;
}

export default function BadgesAndStreaks({ 
  badges, 
  streaks, 
  totalBadges, 
  unlockedBadges 
}: BadgesAndStreaksProps) {
  const rarityColors = {
    common: 'from-gray-500 to-gray-600',
    rare: 'from-blue-500 to-blue-600',
    epic: 'from-purple-500 to-purple-600',
    legendary: 'from-yellow-500 to-yellow-600'
  };

  const streakIcons = {
    workout: '💪',
    nutrition: '🥗',
    logging: '📝',
    general: '🔥'
  };

  const streakColors = {
    workout: 'from-red-500 to-red-600',
    nutrition: 'from-green-500 to-green-600',
    logging: 'from-blue-500 to-blue-600',
    general: 'from-orange-500 to-orange-600'
  };

  return (
    <div className="space-y-6">
      {/* Badges Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Badges & Achievements</h3>
          <div className="text-sm text-gray-400">
            {unlockedBadges}/{totalBadges}
          </div>
        </div>

        {/* Badge Grid */}
        <div className="grid grid-cols-3 gap-3">
          {badges.slice(0, 6).map((badge) => (
            <div 
              key={badge.id}
              className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-2 text-center transition-all duration-300 ${
                badge.unlocked 
                  ? `border-white/30 bg-gradient-to-br ${rarityColors[badge.rarity]} shadow-lg` 
                  : 'border-white/10 bg-white/5 opacity-50'
              }`}
            >
              <div className="text-2xl mb-1">{badge.icon}</div>
              <div className="text-xs font-semibold text-white truncate w-full">
                {badge.name}
              </div>
              {badge.unlocked && (
                <div className="text-xs text-gray-300 mt-1">
                  {badge.unlockedDate ? new Date(badge.unlockedDate).toLocaleDateString() : 'Unlocked'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Badge Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Collection Progress</span>
            <span>{Math.round((unlockedBadges / totalBadges) * 100)}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#EB4747] to-[#FF6B6B] transition-all duration-500 ease-out"
              style={{ width: `${(unlockedBadges / totalBadges) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streaks Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Current Streaks</h3>
        
        <div className="space-y-3">
          {streaks.map((streak) => (
            <div key={streak.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{streakIcons[streak.type]}</span>
                  <span className="text-sm font-medium text-gray-300 capitalize">
                    {streak.type} Streak
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {streak.current} days
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${streakColors[streak.type]} transition-all duration-500 ease-out`}
                    style={{ width: `${Math.min((streak.current / Math.max(streak.longest, 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400">
                  Best: {streak.longest}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Streak Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/5 text-center">
            <div className="text-lg font-bold text-white">
              {Math.max(...streaks.map(s => s.current))}
            </div>
            <div className="text-xs text-gray-400">Longest Active</div>
          </div>
          <div className="p-3 rounded-xl bg-white/5 text-center">
            <div className="text-lg font-bold text-white">
              {Math.max(...streaks.map(s => s.longest))}
            </div>
            <div className="text-xs text-gray-400">Personal Best</div>
          </div>
        </div>
      </div>
    </div>
  );
}
