import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  children?: React.ReactNode;
}

export default function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  trendValue, 
  icon, 
  color = 'primary',
  className = '',
  children 
}: MetricCardProps) {
  const colorClasses = {
    primary: 'border-white/20 bg-gradient-to-br from-white/5 to-white/10',
    success: 'border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-600/5',
    warning: 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5',
    danger: 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-600/5',
    info: 'border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5'
  };

  const trendIcons = {
    up: '↗',
    down: '↘',
    neutral: '→'
  };

  const trendColors = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-gray-400'
  };

  return (
    <div className={`rounded-2xl border p-6 ${colorClasses[color]} ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="p-2 rounded-xl bg-white/10">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-gray-300">{title}</h3>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${trendColors[trend]}`}>
            <span>{trendIcons[trend]}</span>
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      
      <div className="text-3xl font-bold text-white mb-2">
        {value}
      </div>
      
      {children}
    </div>
  );
}
