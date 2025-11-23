import React from 'react';
import Header from '../components/ui/Header';
import HeroSection from '../components/sections/HeroSection';
import FeaturesSection from '../components/sections/FeaturesSection';
import TestimonialsSection from '../components/sections/TestimonialsSection';
import NewsletterSection from '../components/sections/NewsletterSection';
import Footer from '../components/ui/Footer';

const Homepage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#110E0E] text-white font-['Lexend']">
      <Header />
      <main className="pt-[73px]">
        <section id="hero">
          <HeroSection />
        </section>
        <section id="features">
          <FeaturesSection />
        </section>
        <section id="testimonials">
          <TestimonialsSection />
        </section>
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Homepage; 