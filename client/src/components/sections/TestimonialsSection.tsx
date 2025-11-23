import React from 'react';
import sophiaImage from '../../assets/images/sophia-carter.png';
import ethanImage from '../../assets/images/ethan-bennett.png';
import starIcon from '../../assets/images/star-icon.svg';

interface TestimonialCardProps {
  image: string;
  name: string;
  date: string;
  rating: number;
  testimonial: string;
}

const TestimonialCard: React.FC<TestimonialCardProps> = ({ image, name, date, rating, testimonial }) => {
  return (
    <div className="w-[432px] h-[246px] bg-[#1A1A1A] border border-[#663333] rounded-xl p-6 hover:scale-102 hover:shadow-lg hover:border-[#EA2A2A] transition-all duration-300 cursor-pointer">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <img src={image} alt={name} className="w-12 h-12 rounded-full object-cover" />
        <div>
          <h4 className="text-white text-lg font-bold font-['Lexend']">{name}</h4>
          <p className="text-[#C89292] text-sm font-normal font-['Lexend']">{date}</p>
        </div>
      </div>
      
      {/* Rating */}
      <div className="flex items-center gap-1 mb-4">
        {[...Array(5)].map((_, index) => (
          <img 
            key={index}
            src={starIcon} 
            alt="star" 
            className={`w-5 h-5 ${index < rating ? 'opacity-100' : 'opacity-30'}`}
          />
        ))}
      </div>
      
      {/* Testimonial */}
      <p className="text-white text-base font-normal font-['Lexend'] leading-relaxed">
        {testimonial}
      </p>
    </div>
  );
};

const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      image: sophiaImage,
      name: "Sophia Carter",
      date: "2025-05-15",
      rating: 5,
      testimonial: "\"FluxWell has completely transformed my fitness journey. The personalized workout plans and real-time feedback have helped me achieve my goals faster than I ever thought possible.\""
    },
    {
      image: ethanImage,
      name: "Ethan Bennett",
      date: "2025-06-20",
      rating: 4,
      testimonial: "\"I love the AI Fitness Coach feature. It's like having a personal trainer in my pocket, always pushing me to improve and providing valuable insights.\""
    }
  ];

  return (
    <section className="w-full py-20 bg-[#221A1A]">
      <div className="max-w-[1408px] mx-auto px-8">
        {/* Section Title */}
        <h2 className="text-white text-4xl font-bold font-['Lexend'] text-center mb-16 tracking-tight">
          Success Stories
        </h2>
        
        {/* Testimonials Grid */}
        <div className="flex flex-col lg:flex-row gap-8 justify-center items-center">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={index}
              image={testimonial.image}
              name={testimonial.name}
              date={testimonial.date}
              rating={testimonial.rating}
              testimonial={testimonial.testimonial}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection; 