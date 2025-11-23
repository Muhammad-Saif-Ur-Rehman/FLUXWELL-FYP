import React from 'react';

const HeroSection: React.FC = () => {
  return (
    <section className="relative w-full h-[600px] md:h-[700px] bg-[#110E0E] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80')`
        }}
      />
      
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/70"></div>
      
      {/* Additional gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40"></div>
      
      {/* Content */}
      <div className="relative z-10 text-center max-w-[1080px] mx-auto px-6 md:px-8">
        <h1 className="text-white text-4xl sm:text-5xl md:text-6xl lg:text-[72px] font-black font-['Lexend'] leading-[0.9em] tracking-[-0.02em] mb-3 max-w-[900px] mx-auto drop-shadow-2xl">
          Transform Your Health with <span className="text-[#EA2A2A]">AI</span>
        </h1>
        
        <h2 className="text-[#E2E8F0] text-xs sm:text-sm md:text-base font-light font-['Lexend'] leading-[1.4em] mb-10 max-w-[700px] mx-auto whitespace-nowrap drop-shadow-lg">
          Personalized plans. Real-time feedback. One powerful platform.
        </h2>
        
        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          <button className="w-full sm:w-auto px-8 py-3 bg-[#EA2A2A] text-white text-base font-bold font-['Lexend'] rounded-lg hover:bg-[#b91c1c] transition-all duration-300 shadow-lg shadow-[#EA2A2A]/30 tracking-[0.025em] border-none">
            Get Started
          </button>
          <button className="w-full sm:w-auto px-8 py-3 bg-transparent text-white text-base font-semibold font-['Lexend'] rounded-lg border-2 border-white hover:bg-[#b91c1c] hover:border-[#b91c1c] hover:text-white transition-all duration-300 backdrop-blur-sm tracking-[0.025em]">
            Explore Features
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection; 