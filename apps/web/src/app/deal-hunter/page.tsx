'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, Check, HelpCircle, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { useDealHunt, useQueryInterpretation } from '@/lib/hooks/use-deal-hunter';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useAuthStore } from '@/lib/store/auth.store';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { FEATURES } from '@/types/billing.types';
import type { DealHunterMatch } from '@/types/deal-hunter.types';

const EXAMPLES = [
  'laptop under 40,000 EGP with RTX 4060',
  '55 inch Samsung TV under 25,000',
  'phone between 10,000 and 20,000 EGP',
  'gaming laptop with i7 and 16GB ram',
];

export default function DealHunterPage() {
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState('');

  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const canHunt = hasFeature(FEATURES.DEAL_HUNTER);

  const { data: parsed } = useQueryInterpretation(draft);
  const { data, isLoading, isError, error } = useDealHunt(submitted, canHunt);

  const run = (query: string) => {
    setDraft(query);
    setSubmitted(query);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mx-auto max-w-2xl text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Deal Hunter
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ink-50">Describe what you want</h1>
        <p className="mt-2 text-base leading-relaxed text-ink-400">
          Tell us the product, the budget and the specs. We search everything we track, rank it by
          real value, and tell you why.
        </p>
      </header>

      <form
        className="mx-auto mt-7 max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length >= 3) setSubmitted(draft.trim());
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="laptop under 40,000 EGP with RTX 4060"
            aria-label="Describe what you are looking for"
            className="flex-1"
          />
          <Button type="submit" leftIcon={<Search className="h-4 w-4" />} disabled={draft.trim().length < 3}>
            Find it
          </Button>
        </div>

        {/* What we understood, before the search runs — so a misread budget is
            visible and correctable rather than silently returning nothing. */}
        {parsed && !parsed.isEmpty && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-500">We read this as:</span>
            {parsed.categorySlugs.map((slug) => (
              <Badge key={slug} variant="info">{slug.replace(/-/g, ' ')}</Badge>
            ))}
            {parsed.brands.map((brand) => (
              <Badge key={brand} variant="default">{brand}</Badge>
            ))}
            {parsed.specs.map((spec) => (
              <Badge key={spec.field + spec.value} variant="outline">{spec.value}</Badge>
            ))}
            {parsed.price.max != null && (
              <Badge variant="success">under {parsed.price.max.toLocaleString()} EGP</Badge>
            )}
            {parsed.price.min != null && (
              <Badge variant="success">over {parsed.price.min.toLocaleString()} EGP</Badge>
            )}
            {parsed.unparsed && <Badge variant="outline">“{parsed.unparsed}”</Badge>}
          </div>
        )}
      </form>

      {!submitted && (
        <div className="mx-auto mt-6 max-w-2xl">
          <p className="text-xs text-ink-500">Try one of these:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => run(example)}
                className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {!isAuthenticated ? (
          <UpgradePrompt
            title="Sign in to use Deal Hunter"
            description="Deal Hunter searches every product we track, filters it to what you actually asked for, and ranks what is left by real value."
          />
        ) : entitlementsLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : !canHunt ? (
          <UpgradePrompt
            title="Deal Hunter is part of Plus"
            description="Describe what you need in plain words and get a ranked shortlist, scored against each product's own price history and every store carrying it."
          />
        ) : isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-5">
            <p className="text-sm font-medium text-red-300">Search failed</p>
            <p className="mt-1 text-sm text-ink-400">
              {(error as Error)?.message ?? 'Please try again in a moment.'}
            </p>
          </div>
        ) : data ? (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-ink-300">{data.interpretation}</p>
              {data.matches.length > 0 && (
                <p className="text-xs text-ink-500">
                  {data.matches.length} of {data.totalCandidates} candidate(s)
                </p>
              )}
            </div>

            {data.notice ? (
              <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/50 p-6 text-center">
                <AlertCircle className="mx-auto h-5 w-5 text-ink-600" aria-hidden />
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{data.notice}</p>
              </div>
            ) : (
              <ol className="space-y-3">
                {data.matches.map((match, index) => (
                  <MatchCard key={match.productId} match={match} rank={index + 1} />
                ))}
              </ol>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function MatchCard({ match, rank }: { match: DealHunterMatch; rank: number }) {
  const gradeColor =
    match.dealGrade === 'EXCELLENT'
      ? 'text-emerald-400'
      : match.dealGrade === 'GOOD'
        ? 'text-blue-400'
        : match.dealGrade === 'FAIR'
          ? 'text-amber-400'
          : 'text-red-400';

  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900 p-4 transition-colors hover:border-ink-500">
      <div className="flex gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-800 text-xs font-bold text-ink-400">
            {rank}
          </span>
          {match.imageUrl && (
            <Image
              src={match.imageUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 rounded-lg bg-ink-950 object-contain"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              href={`/products/${match.slug}`}
              className="text-sm font-semibold leading-snug text-ink-50 hover:text-signal"
            >
              {match.title}
            </Link>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold tabular-nums text-ink-50">
                {formatCurrency(match.price, match.currency)}
              </p>
              {match.dealScore != null && (
                <p className={cn('text-xs font-medium', gradeColor)}>Deal score {match.dealScore}</p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{match.categoryName}</Badge>
            {match.specsMatched.map((spec) => (
              <Badge key={spec.field + spec.value} variant="success">
                <Check className="h-3 w-3" aria-hidden />
                {spec.value}
              </Badge>
            ))}
            {/* Unconfirmed is shown, not hidden: it is the difference between
                a recommendation and a guess. */}
            {match.specsUnconfirmed.map((spec) => (
              <Badge key={spec.field + spec.value} variant="warning">
                <HelpCircle className="h-3 w-3" aria-hidden />
                {spec.value}?
              </Badge>
            ))}
            {match.inStock === false && <Badge variant="danger">Out of stock</Badge>}
          </div>

          <ul className="mt-2.5 space-y-1">
            {match.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-xs leading-relaxed text-ink-400">
                <span aria-hidden className="mt-[0.35rem] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
