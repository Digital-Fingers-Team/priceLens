'use client';

import { Activity } from 'lucide-react';
import { useProductIntelligence } from '@/lib/hooks/use-intelligence';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useAuthStore } from '@/lib/store/auth.store';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { FEATURES } from '@/types/billing.types';
import { BuyVerdictCard } from './buy-verdict-card';
import { DealScoreCard } from './deal-score-card';
import { DiscountCheckCard } from './discount-check-card';

/**
 * The buying-intelligence section of a product page.
 *
 * The verdict is shown to everyone signed in — on the free plan it is
 * computed over a shorter window, which is honest and is what makes the
 * longer window worth paying for. The advanced deal-score breakdown and the
 * fake-discount check are the paid surfaces.
 */
export function IntelligencePanel({ productId }: { productId: string }) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { data, isLoading, isError, error } = useProductIntelligence(
    isAuthenticated ? productId : undefined,
  );

  if (!isAuthenticated) {
    return (
      <section aria-labelledby="intel-heading" className="space-y-3">
        <Heading />
        <UpgradePrompt
          title="Sign in to see whether now is a good time to buy"
          description="PriceLens compares this price against the history we have recorded ourselves and tells you whether to buy or wait."
        />
      </section>
    );
  }

  if (isLoading || entitlementsLoading) {
    return (
      <section aria-labelledby="intel-heading" className="space-y-3">
        <Heading />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section aria-labelledby="intel-heading" className="space-y-3">
        <Heading />
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-5">
          <p className="text-sm font-medium text-red-300">Could not load buying intelligence</p>
          <p className="mt-1 text-sm text-ink-400">
            {(error as Error)?.message ?? 'Please try again in a moment.'}
          </p>
        </div>
      </section>
    );
  }

  const canSeeDiscountCheck = hasFeature(FEATURES.FAKE_SALE_DETECTION);
  const canSeeAdvancedScore = hasFeature(FEATURES.ADVANCED_DEAL_SCORE);

  return (
    <section aria-labelledby="intel-heading" className="space-y-3">
      <Heading />

      <BuyVerdictCard
        verdict={data.verdict}
        market={data.market}
        history={data.history}
        currency={data.currency}
        windowDays={data.window.days}
      />

      {/* Truthful about the clamp rather than silently showing a short chart. */}
      {data.window.truncated && (
        <UpgradePrompt
          compact
          title={`Showing ${data.window.days} days of history — Plus sees the full record`}
        />
      )}

      {canSeeDiscountCheck ? (
        <DiscountCheckCard check={data.discountCheck} currency={data.currency} />
      ) : (
        data.discountCheck.verdict === 'SUSPICIOUS' && (
          <UpgradePrompt
            title="This store's advertised discount does not match what we recorded"
            description="Plus checks every advertised “was” price against the prices we actually observed, so you can tell a real sale from a marked-up one."
          />
        )
      )}

      {canSeeAdvancedScore ? (
        <DealScoreCard dealScore={data.dealScore} />
      ) : (
        <UpgradePrompt
          title="Advanced deal score"
          description="Scores this price against its own history, every other store carrying it, the depth of the discount and how much of the market we can see — with the full breakdown."
        />
      )}
    </section>
  );
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <Activity className="h-4 w-4 text-signal" aria-hidden />
      <h2 id="intel-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-400">
        Buying intelligence
      </h2>
    </div>
  );
}
