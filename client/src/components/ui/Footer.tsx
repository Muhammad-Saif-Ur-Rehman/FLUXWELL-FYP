import React from 'react';
import logoIcon from '../../assets/images/logo-icon.svg';
import socialIcon1 from '../../assets/images/social-icon-1.svg';
import socialIcon2 from '../../assets/images/social-icon-2.svg';
import socialIcon3 from '../../assets/images/social-icon-3.svg';

const Footer: React.FC = () => {
  return (
    <footer className="w-full h-[240px] bg-[#221A1A] py-10">
      <div className="max-w-[1600px] mx-auto px-8 h-full">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 h-full">
          {/* Logo and Copyright */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
              <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
                <span className="text-white">Flux</span>
                <span className="text-[#EA2A2A]">Well</span>
              </h2>
            </div>
            <p className="text-[#C89292] text-base font-normal font-['Lexend']">
              © 2025 <span className="text-[#C89292]">FluxWell</span>. All rights reserved.
            </p>
          </div>

          {/* Links Column */}
          <div>
            <h3 className="text-white text-base font-bold font-['Lexend'] uppercase tracking-widest mb-4">
              Links
            </h3>
            <div className="flex flex-col gap-3">
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                About
              </a>
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                Features
              </a>
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                Blogs
              </a>
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                Contact
              </a>
            </div>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="text-white text-base font-bold font-['Lexend'] uppercase tracking-widest mb-4">
              Legal
            </h3>
            <div className="flex flex-col gap-3">
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                Privacy Policy
              </a>
              <a href="#" className="text-[#C89292] text-base font-normal font-['Lexend'] hover:text-white transition-colors no-underline">
                Terms of Service
              </a>
            </div>
          </div>

          {/* Social Media Column */}
          <div>
            <h3 className="text-white text-base font-bold font-['Lexend'] uppercase tracking-widest mb-4">
              Follow Us
            </h3>
            <div className="flex items-center gap-4">
              <a href="#" className="w-6 h-6 transition-all duration-300 hover:scale-110 group">
                <img src={socialIcon1} alt="Social Media" className="w-full h-full filter group-hover:brightness-0 group-hover:saturate-100 group-hover:invert-[27%] group-hover:sepia-[96%] group-hover:saturate-[7471%] group-hover:hue-rotate-[358deg] group-hover:brightness-[95%] group-hover:contrast-[114%] transition-all duration-300" />
              </a>
              <a href="#" className="w-6 h-6 transition-all duration-300 hover:scale-110 group">
                <img src={socialIcon2} alt="Social Media" className="w-full h-full filter group-hover:brightness-0 group-hover:saturate-100 group-hover:invert-[27%] group-hover:sepia-[96%] group-hover:saturate-[7471%] group-hover:hue-rotate-[358deg] group-hover:brightness-[95%] group-hover:contrast-[114%] transition-all duration-300" />
              </a>
              <a href="#" className="w-6 h-6 transition-all duration-300 hover:scale-110 group">
                <img src={socialIcon3} alt="Social Media" className="w-full h-full filter group-hover:brightness-0 group-hover:saturate-100 group-hover:invert-[27%] group-hover:sepia-[96%] group-hover:saturate-[7471%] group-hover:hue-rotate-[358deg] group-hover:brightness-[95%] group-hover:contrast-[114%] transition-all duration-300" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 