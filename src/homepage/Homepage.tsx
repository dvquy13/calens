import Navbar from './components/Navbar';
import Hero from './components/Hero';
import DemoVideo from './components/DemoVideo';
import ScreenshotsCarousel from './components/ScreenshotsCarousel';
import BentoGrid from './components/BentoGrid';
import OpenSource from './components/OpenSource';
import CTABanner from './components/CTABanner';
import Footer from './components/Footer';

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <DemoVideo />
      <ScreenshotsCarousel />
      <BentoGrid />
      <OpenSource />
      <CTABanner />
      <Footer />
    </div>
  );
}
