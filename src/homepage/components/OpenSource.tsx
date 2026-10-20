import { Github, Heart } from 'lucide-react';
import { GITHUB_REPO_URL, SUPPORT_URL } from '../../lib/links';
import { Button } from './ui/Button';

export default function OpenSource() {
  return (
    <section id="open-source" className="max-w-7xl mx-auto px-6 py-16 md:py-24 lg:px-16 xl:px-20 flex flex-col items-center text-center gap-6">
      <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
        Free &amp; <span className="text-brand">open source</span>
      </h2>
      <p className="text-foreground-light text-sm max-w-md">
        Calens is free forever, with no tiers or paywalls. The code is open for anyone to read, improve or fork.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button asChild size="large">
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </Button>
        <Button asChild size="large">
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            <Heart className="w-4 h-4" />
            Support Calens
          </a>
        </Button>
      </div>
    </section>
  );
}
