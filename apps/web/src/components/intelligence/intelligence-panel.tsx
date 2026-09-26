'use client';

import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useProductIntelligence } from '@/lib/hooks/use-intelligence';
import { usePathname } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { loginHref } from '@/lib/utils/next-path';
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
  const { t, tf } = useI18n();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { data, isLoading, isError } = useProductIntelligence(isAuthenticated ? productId : undefined);

  const heading = (
    <h2 id="intel-heading" className="text-lg font-semibold text-fg">
      {t.intel.heading}
    </h2>
  );

  let body: React.ReactNode;
  if (!isAuthenticated) {
    body = (
      <UpgradePrompt
        title={t.intel.signInTitle}
        description={t.intel.signInBody}
        action={{ href: loginHref(pathname), label: t.common.signIn }}
      />
    );
  } else if (isLoading || entitlementsLoading) {
    body = (
      <>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  } else if (isError || !data) {
    body = <ErrorState title={t.intel.loadFailed} description={t.intel.loadFailedBody} className="rounded border border-border" />;
  } else {
    const canSeeDiscountCheck = hasFeature(FEATURES.FAKE_SALE_DETECTION);
    const canSeeAdvancedScore = hasFeature(FEATURES.ADVANCED_DEAL_SCORE);
    body = (
      <>
        <BuyVerdictCard
          verdict={data.verdict}
          market={data.market}
          history={data.history}
          currency={data.currency}
          windowDays={data.window.days}
        />
        {/* Truthful about the clamp rather than silently showing a short chart. */}
        {data.window.truncated && <UpgradePrompt compact title={tf(t.intel.windowTruncated, { days: data.window.days })} />}
        {canSeeDiscountCheck ? (
          <DiscountCheckCard check={data.discountCheck} currency={data.currency} />
        ) : (
          data.discountCheck.verdict === 'SUSPICIOUS' && (
            <UpgradePrompt title={t.intel.discountTeaserTitle} description={t.intel.discountTeaserBody} />
          )
        )}
        {canSeeAdvancedScore ? (
          <DealScoreCard dealScore={data.dealScore} />
        ) : (
          <UpgradePrompt title={t.intel.scoreTeaserTitle} description={t.intel.scoreTeaserBody} />
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="intel-heading" className="flex flex-col gap-4">
      {heading}
      {body}
    </section>
  );
}
