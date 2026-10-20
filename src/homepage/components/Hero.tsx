import { Button } from './ui/Button';

const CWS_URL = 'https://chromewebstore.google.com/detail/celfolmbbepfnnmchmfojakakipnmenk';

export default function Hero() {
  return (
    <section className="relative -mt-[65px] overflow-hidden">
      <div className="container mx-auto px-6 pt-[140px] pb-16 md:pt-[160px] md:pb-24 lg:px-16 xl:px-20">
        <div className="mx-auto max-w-3xl flex flex-col items-center text-center gap-6">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-foreground leading-none tracking-tight">
            <span className="block">See Your Time</span>
            <span className="text-brand block">Clearly</span>
          </h1>
          <p className="text-sm lg:text-base text-foreground-light max-w-xl">
            Transform your Google Calendar into a powerful analytics dashboard.
            Track your time, visualize patterns, and make every moment count.{' '}
            <a
              href="https://dvquys.com/posts/the-30m-promise/?utm_source=calens&utm_medium=read_my_story#about-the-questions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              Read my story
            </a>.
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Button asChild size="large">
              <a href={CWS_URL} target="_blank" rel="noopener noreferrer">
                Add to Chrome
              </a>
            </Button>
            <Button
              type="default"
              size="large"
              className="hover:text-brand hover:border-brand hover:bg-alternative"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See Features ↓
            </Button>
          </div>
          <p className="text-sm text-foreground-muted">Works with Google Calendar</p>
        </div>

      </div>
    </section>
  );
}
