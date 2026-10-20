import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { DiscordIcon } from '../../components/icons/DiscordIcon';
import { COMMUNITY_INVITE_URL } from '../../lib/links';
import { Button } from './ui/Button';
import { cn } from '@/lib/utils';

const CWS_URL = 'https://chromewebstore.google.com/detail/celfolmbbepfnnmchmfojakakipnmenk';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setIsMenuOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    setIsMenuOpen(false);
  };

  return (
    <div className="sticky top-0 z-50">
      {/* Background layer */}
      <div className={cn(
        'absolute inset-0 h-full w-full transition-all duration-300',
        scrolled ? 'bg-background/95 backdrop-blur-sm' : 'bg-background/70 backdrop-blur-sm'
      )} />

      {/* Nav content */}
      <nav className="relative z-40 border-b border-default transition-all duration-300">
        <div className="relative flex justify-between h-16 mx-auto lg:container lg:px-16 xl:px-20 px-6">
          {/* Left: Logo + Desktop nav links */}
          <div className="flex items-center gap-8">
            <a href="/homepage.html" className="flex items-center gap-2 hover:text-brand transition-colors">
              <img src="/icons/calens.svg" alt="Calens" className="w-8 h-8" />
              <span className="font-bold text-lg text-foreground">
                Calens
              </span>
            </a>

            <div className="hidden lg:flex items-center gap-1">
              <button
                onClick={() => scrollToSection('features')}
                className="group/nav-item flex items-center gap-1 text-sm font-medium text-foreground-light hover:text-brand px-3 py-1.5 rounded-md transition-all"
              >
                <ChevronDown className="w-3 h-3 transition-all will-change-transform -translate-y-1 opacity-0 group-hover/nav-item:translate-y-0 group-hover/nav-item:opacity-100" />
                Features
              </button>
              <button
                onClick={() => scrollToSection('open-source')}
                className="group/nav-item flex items-center gap-1 text-sm font-medium text-foreground-light hover:text-brand px-3 py-1.5 rounded-md transition-all"
              >
                <ChevronDown className="w-3 h-3 transition-all will-change-transform -translate-y-1 opacity-0 group-hover/nav-item:translate-y-0 group-hover/nav-item:opacity-100" />
                Open source
              </button>
              <a
                href={COMMUNITY_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group/nav-item flex items-center gap-1 text-sm font-medium text-foreground-light hover:text-brand px-3 py-1.5 rounded-md transition-all"
              >
                <ChevronDown className="w-3 h-3 transition-all will-change-transform -translate-y-1 opacity-0 group-hover/nav-item:translate-y-0 group-hover/nav-item:opacity-100" />
                <DiscordIcon className="w-4 h-4" />
                Community
              </a>
            </div>
          </div>

          {/* Right: CTA button + hamburger */}
          <div className="flex items-center gap-2">
            <Button asChild size="small" className="hidden lg:flex">
              <a href={CWS_URL} target="_blank" rel="noopener noreferrer">Add to Chrome</a>
            </Button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 text-foreground"
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-background animate-in fade-in duration-200 lg:hidden">
          <div className="flex flex-col items-center gap-6 p-8 pt-12">
            <button
              onClick={() => scrollToSection('features')}
              className="text-xl font-medium text-foreground-light hover:text-brand transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('open-source')}
              className="text-xl font-medium text-foreground-light hover:text-brand transition-colors"
            >
              Open source
            </button>
            <a
              href={COMMUNITY_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xl font-medium text-foreground-light hover:text-brand transition-colors"
            >
              <DiscordIcon className="w-5 h-5" />
              Community
            </a>
            <Button asChild size="large" className="mt-4 w-full max-w-xs">
              <a href={CWS_URL} target="_blank" rel="noopener noreferrer">Add to Chrome</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
