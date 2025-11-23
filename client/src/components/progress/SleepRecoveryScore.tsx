import React from 'react';

interface SleepData {
  date: string;
  duration: number; // hours
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  deepSleep: number; // hours
  remSleep: number; // hours
  lightSleep: number; // hours
  awakenings: number;
}

interface SleepRecoveryScoreProps {
  currentScore: number;
  sleepData: SleepData[];
  weeklyAverage: number;
  targetHours: number;
}

export default function SleepRecoveryScore({ 
  currentScore, 
  sleepData, 
  weeklyAverage, 
  targetHours 
}: SleepRecoveryScoreProps) {
  const recentData = sleepData.slice(-7);
  const averageDuration = recentData.length > 0 
    ? recentData.reduce((sum, day) => sum + day.duration, 0) / recentData.length 
    : 0;
  
  const qualityColors = {
    poor: 'from-red-500 to-red-600',
    fair: 'from-yellow-500 to-yellow-600',
    good: 'from-blue-500 to-blue-600',
    excellent: 'from-green-500 to-green-600'
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'from-green-500 to-green-600';
    if (score >= 70) return 'from-blue-500 to-blue-600';
    if (score >= 50) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };

  return (
    <div className="space-y-4">
      {/* Main Score */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white">
            {currentScore}
          </div>
          <div className="text-sm text-gray-400">
            Recovery Score
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Quality</div>
          <div className={`text-lg font-semibold ${
            currentScore >= 90 ? 'text-green-400' :
            currentScore >= 70 ? 'text-blue-400' :
            currentScore >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {getScoreLabel(currentScore)}
          </div>
        </div>
      </div>

      {/* Score Visualization */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Recovery Level</span>
          <span>{currentScore}/100</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${getScoreColor(currentScore)} transition-all duration-500 ease-out`}
            style={{ width: `${currentScore}%` }}
          />
        </div>
      </div>

      {/* Sleep Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 text-center">
          <div className="text-lg font-bold text-white">
            {averageDuration.toFixed(1)}h
          </div>
          <div className="text-xs text-gray-400">Avg Duration</div>
        </div>
        <div className="p-3 rounded-xl bg-white/5 text-center">
          <div className="text-lg font-bold text-white">
            {weeklyAverage.toFixed(0)}
          </div>
          <div className="text-xs text-gray-400">Weekly Score</div>
        </div>
      </div>

      {/* Sleep Quality Chart */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">7-Day Sleep Quality</div>
        <div className="flex items-end gap-1 h-16">
          {recentData.map((day, index) => {
            const qualityScore = {
              poor: 25,
              fair: 50,
              good: 75,
              excellent: 100
            }[day.quality];
            
            const height = Math.max(8, (qualityScore / 100) * 48);
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t transition-all duration-300 bg-gradient-to-t ${qualityColors[day.quality]}`}
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

      {/* Sleep Breakdown */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400">Last Night's Sleep</div>
        {recentData.length > 0 && (
          <div className="space-y-2">
            {(() => {
              const lastNight = recentData[recentData.length - 1];
              return (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">Duration</span>
                    <span className="text-white">{lastNight.duration.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">Deep Sleep</span>
                    <span className="text-white">{lastNight.deepSleep.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">REM Sleep</span>
                    <span className="text-white">{lastNight.remSleep.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">Awakenings</span>
                    <span className="text-white">{lastNight.awakenings}</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Target Progress */}
      <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5">
        <div className={`w-2 h-2 rounded-full ${
          averageDuration >= targetHours ? 'bg-green-500' : 'bg-yellow-500'
        }`} />
        <span className="text-sm text-gray-300">
          {averageDuration >= targetHours 
            ? `Meeting ${targetHours}h target!` 
            : `${(targetHours - averageDuration).toFixed(1)}h under target`
          }
        </span>
      </div>
    </div>
  );
}
