import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const screenshots = [
  {
    src: '/screenshots/calens-screenshot.png',
    alt: 'Calens Calendar View - Google Calendar with analytics side panel',
    bgColor: 'bg-surface-100',
  },
  {
    src: '/screenshots/calens-screenshot-3.png',
    alt: 'Calens Side Panel Preview',
    bgColor: 'bg-surface-75',
  },
];

export default function ScreenshotsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? screenshots.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === screenshots.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-16 lg:px-16 xl:px-20">
      <div className="relative">
        {/* Main image container */}
        <div className={`relative rounded-2xl overflow-hidden shadow-2xl transition-colors duration-500 ${screenshots[currentIndex].bgColor}`}>
          <div className="relative aspect-[16/10]">
            {screenshots.map((screenshot, index) => (
              <img
                key={screenshot.src}
                src={screenshot.src}
                alt={screenshot.alt}
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                  index === currentIndex ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-surface-75/90 hover:bg-surface-75 p-3 rounded-full shadow-lg transition-all hover:scale-110"
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="w-6 h-6 text-foreground" />
        </button>
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-surface-75/90 hover:bg-surface-75 p-3 rounded-full shadow-lg transition-all hover:scale-110"
          aria-label="Next screenshot"
        >
          <ChevronRight className="w-6 h-6 text-foreground" />
        </button>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-2 mt-6">
        {screenshots.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentIndex
                ? 'bg-brand scale-110'
                : 'bg-border-strong hover:bg-border-stronger'
            }`}
            aria-label={`Go to screenshot ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
