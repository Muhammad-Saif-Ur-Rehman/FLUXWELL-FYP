import React, { useEffect, useState } from 'react';

export interface BadgeUnlock {
  name: string;
  description: string;
  icon: string;
  rarity: string;
  category: string;
}

interface BadgeNotificationProps {
  badge: BadgeUnlock | null;
  onClose: () => void;
}

export default function BadgeNotification({ badge, onClose }: BadgeNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (badge) {
      // Trigger entrance animation
      setTimeout(() => setIsVisible(true), 50);
      setTimeout(() => setIsAnimating(true), 100);
      
      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [badge]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 300);
  };

  if (!badge) return null;

  const rarityColors = {
    common: 'from-gray-500 to-gray-700',
    rare: 'from-blue-500 to-blue-700',
    epic: 'from-purple-500 to-purple-700',
    legendary: 'from-yellow-500 to-yellow-700',
  };

  const rarityGlow = {
    common: 'shadow-[0_0_30px_rgba(156,163,175,0.5)]',
    rare: 'shadow-[0_0_30px_rgba(59,130,246,0.6)]',
    epic: 'shadow-[0_0_30px_rgba(168,85,247,0.7)]',
    legendary: 'shadow-[0_0_40px_rgba(234,179,8,0.8)]',
  };

  const gradient = rarityColors[badge.rarity as keyof typeof rarityColors] || rarityColors.common;
  const glow = rarityGlow[badge.rarity as keyof typeof rarityGlow] || rarityGlow.common;

  return (
    <div
      className={`fixed top-24 right-6 z-[9999] transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      }`}
    >
      <div
        className={`relative bg-gradient-to-br ${gradient} rounded-2xl p-6 min-w-[380px] ${glow} transition-all duration-300 ${
          isAnimating ? 'scale-100' : 'scale-95'
        }`}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 transition-colors text-white/80 hover:text-white"
          aria-label="Close"
        >
          ×
        </button>

        {/* Content */}
        <div className="flex items-start gap-4">
          {/* Icon with animation */}
          <div className={`text-6xl transition-all duration-500 ${isAnimating ? 'scale-100 rotate-0' : 'scale-50 rotate-45'}`}>
            {badge.icon}
          </div>

          {/* Text content */}
          <div className="flex-1 pt-2">
            <div className="text-sm font-semibold text-white/90 uppercase tracking-wider mb-1">
              Badge Unlocked!
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {badge.name}
            </h3>
            <p className="text-white/90 text-sm leading-relaxed">
              {badge.description}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-black/30 text-xs font-semibold text-white/90 uppercase">
                {badge.rarity}
              </span>
              <span className="px-3 py-1 rounded-full bg-black/20 text-xs text-white/80">
                {badge.category}
              </span>
            </div>
          </div>
        </div>

        {/* Animated sparkles */}
        {isAnimating && (
          <>
            <div className="absolute top-4 left-4 text-yellow-300 animate-ping opacity-75">✨</div>
            <div className="absolute bottom-4 right-12 text-yellow-300 animate-ping opacity-75 animation-delay-200">✨</div>
            <div className="absolute top-12 right-4 text-yellow-300 animate-ping opacity-75 animation-delay-400">✨</div>
          </>
        )}

        {/* Progress bar animation */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 rounded-b-2xl overflow-hidden">
          <div 
            className="h-full bg-white/50 transition-all duration-[5000ms] ease-linear"
            style={{ width: isAnimating ? '0%' : '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

