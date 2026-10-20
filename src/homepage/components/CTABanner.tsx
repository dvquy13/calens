import { Button } from './ui/Button';

const CWS_URL = 'https://chromewebstore.google.com/detail/celfolmbbepfnnmchmfojakakipnmenk';

export default function CTABanner() {
  return (
    <section>
      <div className="max-w-7xl mx-auto px-6 py-24 lg:px-16 xl:px-20 flex flex-col items-center text-center gap-6">
        <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
          Start seeing your time clearly
        </h2>
        <p className="text-foreground-light text-sm max-w-md">
          Free and open source. Works with your existing Google Calendar.
        </p>
        <Button asChild size="large">
          <a href={CWS_URL} target="_blank" rel="noopener noreferrer">Add to Chrome</a>
        </Button>
      </div>
    </section>
  );
}
