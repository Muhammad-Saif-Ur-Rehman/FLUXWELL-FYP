import React from 'react';
import { Link } from 'react-router-dom';
import logoIcon from '../../assets/images/logo-icon.svg';

const Header: React.FC = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  return (
    <header className="w-full h-[73px] bg-[#110E0E] border-b border-[#663333] backdrop-blur-sm fixed top-0 left-0 right-0 z-50">
      <div className="max-w-[1920px] mx-auto px-10 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollToSection('hero')}>
          <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
          <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
            <span className="text-white">Flux</span>
            <span className="text-[#EA2A2A]">Well</span>
          </h2>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => scrollToSection('hero')}
            className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300 bg-transparent border-none cursor-pointer"
          >
            Home
          </button>
          <a href="#" className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300">
            About
          </a>
          <button 
            onClick={() => scrollToSection('features')}
            className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300 bg-transparent border-none cursor-pointer"
          >
            Features
          </button>
          <Link to="/coach" className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300">
            Coach
          </Link>
          <Link to="/feed" className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300">
            Blogs
          </Link>
          <a href="#" className="text-white text-base font-medium font-['Lexend'] hover:text-[#EA2A2A] transition-colors duration-300">
            Contact
          </a>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-2">
          <Link 
            to="/login"
            className="px-6 py-2.5 bg-[#ff6b6b] text-white text-sm font-bold font-['Lexend'] rounded-full hover:bg-[#b91c1c] transition-all duration-300 tracking-wider shadow-lg inline-block"
          >
            Login
          </Link>
          <Link 
            to="/signup"
            className="px-6 py-2.5 bg-[#EA2A2A] text-white text-sm font-bold font-['Lexend'] rounded-full hover:bg-[#b91c1c] transition-all duration-300 tracking-wider inline-block"
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header; 