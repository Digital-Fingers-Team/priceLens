import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchBar } from '@/components/search/search-bar';
import { TrendingSection } from './_components/trending-section';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { TrendingUp, ShieldCheck, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PriceLens — Find the Best Price',
  description: 'Compare product prices across Amazon, Newegg, Best Buy and more. One search, every price.',
};

function HeroFeatures() {
  return (
    <div className="flex flex-wrap justify-center gap-6 text-sm text-ink-500">
      {[
        { icon: Zap, label: 'Real-time prices' },
        { icon: ShieldCheck, label: 'Verified products' },
        { icon: TrendingUp, label: 'Price history' },
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
        <div className="absolute inset-0 bg-grid-pattern opacity-100 pointer-events-none" />
        {/* Radial glow */}
        <div className="absolute inset-0 bg-radial-gradient pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,255,136,0.06), transparent)' }}
        />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-signal/20 bg-signal/5 text-signal text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-signal" />
              Prices updated continuously
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-ink-50 leading-[1.1] text-balance">
              One search.<br />
              <span className="text-signal">Every price.</span>
            </h1>

            <p className="text-lg text-ink-400 max-w-xl mx-auto text-balance">
              Compare prices across Amazon, Newegg, Best Buy, and more.
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
              {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          }
        >
          <TrendingSection />
        </Suspense>
      </section>
    </>
  );
}