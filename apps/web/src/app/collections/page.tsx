import Link from 'next/link';
import { ArrowRight, Share2, Sparkles, Tag, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

const COLLECTIONS = [
  {
    title: 'Best deals today',
    description: 'Fast-moving discounts and products with the strongest gap versus their usual range.',
    accent: 'Lowest now',
  },
  {
    title: 'Budget essentials',
    description: 'Useful everyday products where the value signal is stronger than the brand signal.',
    accent: 'Most affordable',
  },
  {
    title: 'Verified favorites',
    description: 'Items with strong canonical matching, multiple listings, and higher trust cues.',
    accent: 'High confidence',
  },
  {
    title: 'Top watched items',
    description: 'Products people are saving most often so you can see what others care about.',
    accent: 'Popular',
  },
];

export default function CollectionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="rounded-3xl border border-ink-800 bg-gradient-to-br from-ink-900 via-ink-950 to-ink-900 p-8">
        <div className="max-w-3xl space-y-4">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-signal">
            <Sparkles className="w-4 h-4" /> Public collections
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-ink-50 leading-tight">
            Curated shopping lists that are easy to share, easy to trust, and easy to act on.
          </h1>
          <p className="text-ink-400 text-lg">
            These collections are designed for the people who like to send deals to friends, revisit saved picks, and discover products through context instead of raw search.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {COLLECTIONS.map((item) => (
          <div key={item.title} className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-100">{item.title}</h2>
              <Tag className="w-4 h-4 text-signal" />
            </div>
            <p className="mt-3 text-sm text-ink-400">{item.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-ink-500">{item.accent}</span>
              <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Explore
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-signal/20 bg-signal/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wider text-signal">Share loop</p>
          <h2 className="text-xl font-bold text-ink-50 mt-1">Make collections part of the product, not a hidden page.</h2>
          <p className="text-sm text-ink-400 mt-2">
            Users are more likely to share a useful list than a lone product URL.
          </p>
        </div>
        <Link href="/search">
          <Button variant="primary" leftIcon={<Share2 className="w-4 h-4" />}>
            Start browsing
          </Button>
        </Link>
      </div>
    </div>
  );
}
