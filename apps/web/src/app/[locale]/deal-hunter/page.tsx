'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, HelpCircle, Search } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useDealHunt, useQueryInterpretation } from '@/lib/hooks/use-deal-hunter';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import { productTitle } from '@/lib/product-title';
import { FEATURES } from '@/types/billing.types';
import type { DealHunterMatch, DealHunterReason } from '@/types/deal-hunter.types';

const GRADE_TEXT = { EXCELLENT: 'text-success', GOOD: 'text-info', FAIR: 'text-warning', POOR: 'text-danger' } as const;

export default function DealHunterPage() {
  const { t, tf, fmt, locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState('');

  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const canHunt = hasFeature(FEATURES.DEAL_HUNTER);

  const { data: parsed } = useQueryInterpretation(draft);
  const { data, isLoading, isError } = useDealHunt(submitted, canHunt);

  const run = (query: string) => {
    setDraft(query);
    setSubmitted(query);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <p className="label-mono text-brand-text">{t.nav.dealHunter}</p>
        <h1 className="text-2xl font-semibold text-fg">{t.dealHunter.title}</h1>
        <p className="text-base text-muted">{t.dealHunter.lede}</p>
      </header>

      <form
        className="flex max-w-2xl flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length >= 3) setSubmitted(draft.trim());
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.dealHunter.examples[0]}
            aria-label={t.dealHunter.inputLabel}
            dir="auto"
            wrapperClassName="flex-1"
          />
          <Button type="submit" leftIcon={<Search className="h-4 w-4" aria-hidden />} disabled={draft.trim().length < 3}>
            {t.dealHunter.submit}
          </Button>
        </div>

        {/* What we understood, before the search runs — so a misread budget is
            visible and correctable rather than silently returning nothing. */}
        {parsed && !parsed.isEmpty && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{t.dealHunter.readAs}</span>
            {parsed.categorySlugs.map((slug) => (
              <Badge key={slug} variant="info">
                {(t.categories as Record<string, string>)[slug] ?? slug.replace(/-/g, ' ')}
              </Badge>
            ))}
            {parsed.brands.map((brand) => (
              <Badge key={brand}>{brand}</Badge>
            ))}
            {parsed.specs.map((spec) => (
              <Badge key={spec.field + spec.value} variant="outline">
                {spec.value}
              </Badge>
            ))}
            {parsed.price.max != null && (
              <Badge variant="brand">{tf(t.dealHunter.under, { price: fmt.currency(parsed.price.max) })}</Badge>
            )}
            {parsed.price.min != null && (
              <Badge variant="brand">{tf(t.dealHunter.over, { price: fmt.currency(parsed.price.min) })}</Badge>
            )}
            {parsed.unparsed && <Badge variant="outline">“{parsed.unparsed}”</Badge>}
          </div>
        )}
      </form>

      {!submitted && (
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-xs text-muted">{t.dealHunter.tryThese}</p>
          <div className="flex flex-wrap gap-2">
            {t.dealHunter.examples.map((example) => (
              <button
                key={example}
                type="button"
                dir="auto"
                onClick={() => run(example)}
                className="h-8 rounded-sm border border-border px-3 text-xs text-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        {!isAuthenticated ? (
          <UpgradePrompt
            title={t.dealHunter.signInTitle}
            description={t.dealHunter.signInBody}
            action={{ href: '/login?next=%2Fdeal-hunter', label: t.common.signIn }}
            headingLevel="h2"
          />
        ) : entitlementsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !canHunt ? (
          <UpgradePrompt title={t.dealHunter.plusTitle} description={t.dealHunter.plusBody} />
        ) : isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-32 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState title={t.dealHunter.failed} description={t.intel.loadFailedBody} />
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* The API words its reading in English; other languages have the chips above. */}
              {locale === 'en' ? (
                <p className="text-sm text-fg" dir="auto">
                  {data.interpretation}
                </p>
              ) : (
                <span />
              )}
              {data.matches.length > 0 && (
                <p className="text-xs text-muted">
                  {tf(t.dealHunter.ofCandidates, { shown: data.matches.length, total: data.totalCandidates })}
                </p>
              )}
            </div>
            {data.notice ? (
              <EmptyState title={(data.noticeCode && t.dealHunter.notices[data.noticeCode]) || data.notice} className="rounded border border-dashed border-border-strong" />
            ) : (
              <ol className="flex flex-col gap-3">
                {data.matches.map((match, index) => (
                  <MatchCard key={match.productId} match={match} rank={index + 1} />
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MatchCard({ match, rank }: { match: DealHunterMatch; rank: number }) {
  const { t, tf, fmt, locale } = useI18n();
  // Reasons in the page language when the API sent codes; its English sentences otherwise.
  const word = (reason: DealHunterReason) => {
    const params = Object.fromEntries(
      Object.entries(reason.params).map(([key, value]) =>
        typeof value === 'number' && (key === 'price' || key === 'headroom') ? [key, fmt.currency(value, match.currency)] : [key, value],
      ),
    );
    return tf(t.dealHunter.reasons[reason.code] ?? '', params);
  };
  const reasons = match.reasonCodes ? match.reasonCodes.map(word).filter(Boolean) : match.reasons;
  const gradeText = match.dealGrade ? GRADE_TEXT[match.dealGrade as keyof typeof GRADE_TEXT] : 'text-muted';

  return (
    <li className="flex gap-4 rounded border border-border bg-surface p-4">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="font-mono text-xs text-muted">{String(rank).padStart(2, '0')}</span>
        {match.imageUrl && (
          <Image src={match.imageUrl} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-sm bg-media object-contain" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link href={`/products/${match.slug}`} dir="auto" className="text-sm font-medium text-fg hover:text-brand-text">
            {productTitle(match, locale)}
          </Link>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-base font-semibold tabular-nums text-fg">{fmt.currency(match.price, match.currency)}</p>
            {match.dealScore != null && (
              <p className={cn('text-xs font-medium', gradeText)}>{tf(t.dealHunter.score, { score: match.dealScore })}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{(locale === 'ar' && match.categoryNameAr) || match.categoryName}</Badge>
          {match.specsMatched.map((spec) => (
            <Badge key={spec.field + spec.value} variant="success">
              <Check className="h-3 w-3" aria-hidden />
              {spec.value}
            </Badge>
          ))}
          {/* Unconfirmed is shown, not hidden: it is the difference between
              a recommendation and a guess. */}
          {match.specsUnconfirmed.map((spec) => (
            <Badge key={spec.field + spec.value} variant="warning" title={t.dealHunter.unconfirmed}>
              <HelpCircle className="h-3 w-3" aria-hidden />
              {spec.value}
            </Badge>
          ))}
          {match.inStock === false && <Badge variant="danger">{t.product.outOfStock}</Badge>}
        </div>
        <ul className="flex list-disc flex-col gap-1 ps-4 text-xs text-muted marker:text-border-strong" dir="auto">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
