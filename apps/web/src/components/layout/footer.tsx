import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-signal flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-ink-950" />
            </div>
            <span className="font-bold text-ink-200">
              Price<span className="text-signal">Lens</span>
            </span>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
            <Link href="/search" className="hover:text-ink-200 transition-colors">Browse</Link>
            <Link href="/watchlist" className="hover:text-ink-200 transition-colors">Watchlist</Link>
            <Link href="/login" className="hover:text-ink-200 transition-colors">Sign in</Link>
          </nav>

          <p className="text-xs text-ink-600">
            © {new Date().getFullYear()} PriceLens. Price data updated continuously.
          </p>
        </div>
      </div>
    </footer>
  );
}