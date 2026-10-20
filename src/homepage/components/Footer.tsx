import { COMMUNITY_INVITE_URL } from '../../lib/links';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-alternative">
      <div className="max-w-7xl mx-auto px-6 py-12 lg:px-16 xl:px-20">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/icons/calens.svg" alt="Calens" className="w-6 h-6" />
              <span className="font-semibold text-foreground">Calens</span>
            </div>
            <p className="text-sm text-foreground-light">Google Calendar, enhanced.</p>
          </div>
          <div className="flex gap-8 text-sm">
            <a href="/privacy.html" className="text-foreground-light hover:text-foreground transition-colors">Privacy Policy</a>
            <a href={COMMUNITY_INVITE_URL} className="text-foreground-light hover:text-foreground transition-colors">Community</a>
          </div>
        </div>
        <div className="border-t border-default mt-8 pt-8">
          <p className="text-xs text-foreground-muted">© {year} Calens. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
