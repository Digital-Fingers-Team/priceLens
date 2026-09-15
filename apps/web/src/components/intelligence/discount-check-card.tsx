'use client';

import { AlertTriangle, BadgeCheck, HelpCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { DiscountCheck } from '@/types/intelligence.types';

/**
 * Surfaces whether an advertised discount matches what the product actually
 * cost. Never renders for NO_DISCOUNT_CLAIMED — an absent claim is not a
 * finding, and showing a green tick there would imply we had verified
 * something we had not.
 */
export function DiscountCheckCard({ check, currency }: { check: DiscountCheck; currency: string }) {
  if (check.verdict === 'NO_DISCOUNT_CLAIMED') return null;

  if (check.verdict === 'SUSPICIOUS') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-amber-300">Possibly misleading discount</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{check.explanation}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div>
                <dt className="text-ink-500">Advertised was</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-ink-300 line-through">
                  {formatCurrency(check.advertisedWas ?? 0, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Typically sold for</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-amber-300">
                  {formatCurrency(check.observedTypicalPrice ?? 0, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Claimed saving</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-ink-300">
                  {check.claimedDiscountPct?.toFixed(0)}%
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Real saving</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-amber-300">
                  {check.realDiscountPct?.toFixed(0)}%
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    );
  }

  if (check.verdict === 'UNVERIFIABLE') {
    return (
      <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
          <div>
            <h3 className="text-sm font-medium text-ink-300">Discount not verified</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">{check.explanation}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
      <div className="flex items-start gap-2.5">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        <div>
          <h3 className="text-sm font-medium text-emerald-300">Discount looks genuine</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">{check.explanation}</p>
        </div>
      </div>
    </div>
  );
}
