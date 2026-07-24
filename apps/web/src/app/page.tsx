import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search/search-bar';
import { TrendingSection } from './_components/trending-section';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import Link from 'next/link';
import { TrendingUp, BarChart3, Bell, Store, Share2, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'PriceLens — Find the Best Price',
  description: 'Compare product prices across Amazon, Noon, Jumia and more. One search, every price.',
};

function HeroFeatures() {
  return (
    <div className="flex flex-wrap justify-center gap-6 text-sm text-ink-500">
      {[
        { icon: Store, label: 'Compare across stores' },
        { icon: BarChart3, label: 'Price history charts' },
        { icon: Bell, label: 'Track price drops' },
      ].map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-signal" />
          {label}
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-ink-50 leading-[1.1] text-balance">
              One search.<br />
              <span className="text-signal">Every price.</span>
            </h1>

            <p className="text-lg text-ink-400 max-w-xl mx-auto text-balance">
              Compare prices across Amazon, Noon, Jumia, and more.
              Our matching engine groups identical products so you always see the real range.
            </p>
          </div>

          <SearchBar size="hero" className="w-full" />
          <HeroFeatures />
        </div>
      </section>

      {/* Trending products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-signal" />
          <h2 className="text-xl font-bold text-ink-100">Trending Products</h2>
        </div>

        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          }
        >
          <TrendingSection />
        </Suspense>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-3xl border border-ink-800 bg-gradient-to-br from-ink-900 via-ink-950 to-ink-900 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm uppercase tracking-[0.2em] text-signal">Shareable collections</p>
              <h2 className="text-2xl sm:text-3xl font-black text-ink-50">
                Turn product research into something people actually forward to friends.
              </h2>
              <p className="text-ink-400">
                PriceLens works best when people can compare, save, and share without friction. Collections give them a reason to come back.
              </p>
            </div>
            <Link href="/collections">
              <Button variant="primary" leftIcon={<Share2 className="w-4 h-4" />}>
                Browse collections
              </Button>
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Best deals today', copy: 'A live feed of the sharpest price drops.', badge: 'Trending' },
              { title: 'Budget picks', copy: 'The cheapest good options across key categories.', badge: 'Saved often' },
              { title: 'Verified favorites', copy: 'Top products with strong matching and trust signals.', badge: 'Trusted' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-ink-700 bg-ink-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-ink-100">{item.title}</h3>
                  <BadgeCheck className="w-4 h-4 text-signal" />
                </div>
                <p className="mt-2 text-sm text-ink-400">{item.copy}</p>
                <p className="mt-4 text-xs uppercase tracking-wider text-ink-500">{item.badge}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
