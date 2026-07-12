import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search/search-bar';
import { TrendingSection } from './_components/trending-section';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { TrendingUp, BarChart3, Bell, Store } from 'lucide-react';

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
    </>
  );
}