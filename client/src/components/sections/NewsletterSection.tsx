import React, { useState } from 'react';

const NewsletterSection: React.FC = () => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle newsletter signup
    console.log('Newsletter signup:', email);
    setEmail('');
  };

  return (
    <section className="w-full py-20 bg-[#110E0E]">
      <div className="max-w-[672px] mx-auto px-8 text-center">
        {/* Section Title */}
        <h2 className="text-white text-4xl font-bold font-['Lexend'] mb-4 tracking-tight">
          Stay Updated with Our Newsletter
        </h2>
        
        {/* Description */}
        <p className="text-[#C89292] text-base font-normal font-['Lexend'] leading-relaxed mb-12">
          Get the latest fitness tips, news, and exclusive offers delivered to your inbox.
        </p>
        
        {/* Newsletter Form */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex flex-col sm:flex-row items-center bg-[#221A1A] border border-[#663333] rounded-full p-2 gap-2">
            <div className="flex-1 w-full px-5 py-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full bg-transparent text-[#C89292] text-base font-normal font-['Lexend'] placeholder-[#C89292] focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-3 bg-[#EA2A2A] text-white text-base font-bold font-['Lexend'] rounded-full hover:bg-[#b91c1c] transition-all duration-300 border-none"
            >
              Subscribe
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default NewsletterSection; 