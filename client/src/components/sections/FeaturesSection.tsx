import React from 'react';
import assessmentIcon from '../../assets/images/assessment-icon.svg';
import workoutIcon from '../../assets/images/workout-icon.svg';
import nutritionIcon from '../../assets/images/nutrition-icon.svg';
import trackingIcon from '../../assets/images/tracking-icon.svg';
import coachIcon from '../../assets/images/coach-icon.svg';
import progressIcon from '../../assets/images/progress-icon.svg';
import movementIcon from '../../assets/images/movement-icon.svg';
import blogIcon from '../../assets/images/blog-icon.svg';

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="w-[296px] h-[222px] bg-[#221A1A] border border-[#663333] rounded-xl p-6 flex flex-col items-center text-center hover:scale-102 hover:shadow-lg hover:border-[#EA2A2A] transition-all duration-300 cursor-pointer">
      {/* Icon Container */}
      <div className="w-16 h-16 bg-[#472424] rounded-full flex items-center justify-center mb-4">
        <img src={icon} alt={title} className="w-8 h-8" />
      </div>
      
      {/* Title */}
      <h3 className="text-white text-xl font-bold font-['Lexend'] leading-tight mb-3">
        {title}
      </h3>
      
      {/* Description */}
      <p className="text-[#C89292] text-base font-normal font-['Lexend'] leading-relaxed">
        {description}
      </p>
    </div>
  );
};

const FeaturesSection: React.FC = () => {
  const features = [
    {
      icon: assessmentIcon,
      title: "Assessment",
      description: "AI-driven analysis of your fitness level."
    },
    {
      icon: workoutIcon,
      title: "Workout Planning",
      description: "Customized exercise routines for you."
    },
    {
      icon: nutritionIcon,
      title: "Nutrition & Diet",
      description: "Tailored meal plans and dietary advice."
    },
    {
      icon: trackingIcon,
      title: "Real-Time Tracking",
      description: "Monitor your activity and health stats live."
    },
    {
      icon: coachIcon,
      title: "AI Coach (Fluxie)",
      description: "Your 24/7 virtual fitness companion."
    },
    {
      icon: progressIcon,
      title: "Progress Tracking",
      description: "Visualize your achievements over time."
    },
    {
      icon: movementIcon,
      title: "Movement Analysis",
      description: "Perfect your form with AI feedback."
    },
    {
      icon: blogIcon,
      title: "Blogpost Generator",
      description: "AI-curated articles on health and fitness."
    }
  ];

  return (
    <section className="w-full py-20 bg-[#110E0E]">
      <div className="max-w-[1600px] mx-auto px-8">
        {/* Section Title */}
        <h2 className="text-white text-4xl font-bold font-['Lexend'] text-center mb-16 tracking-tight">
          AI-Powered Features
        </h2>
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 justify-items-center">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection; 