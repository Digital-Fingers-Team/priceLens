'use client';

import { AlertTriangle, BadgeCheck, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import type { DiscountCheck } from '@/types/intelligence.types';

/**
 * Surfaces whether an advertised discount matches what the product actually
 * cost. Never renders for NO_DISCOUNT_CLAIMED — an absent claim is not a
 * finding, and showing a green tick there would imply we had verified
 * something we had not.
 */
export function DiscountCheckCard({ check, currency }: { check: DiscountCheck; currency: string }) {
  const { t, fmt } = useI18n();
  if (check.verdict === 'NO_DISCOUNT_CLAIMED') return null;

  const variants = {
    SUSPICIOUS: { Icon: AlertTriangle, tone: 'border-warning/40 bg-warning-soft', icon: 'text-warning', title: t.intel.discountSuspicious },
    UNVERIFIABLE: { Icon: HelpCircle, tone: 'border-border bg-surface', icon: 'text-muted', title: t.intel.discountUnverified },
    GENUINE: { Icon: BadgeCheck, tone: 'border-success/40 bg-success-soft', icon: 'text-success', title: t.intel.discountGenuine },
  } as const;
  const { Icon, tone, icon, title } = variants[check.verdict as keyof typeof variants] ?? variants.UNVERIFIABLE;

  return (
    <div className={cn('flex items-start gap-3 rounded border p-4 sm:p-6', tone)}>
      <Icon className={cn('h-5 w-5 shrink-0', icon)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="text-sm text-muted" dir="auto">
          {check.explanation}
        </p>
        {check.verdict === 'SUSPICIOUS' && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Fact label={t.intel.advertisedWas} value={<s>{fmt.currency(check.advertisedWas ?? 0, currency)}</s>} />
            <Fact label={t.intel.typicallySold} value={fmt.currency(check.observedTypicalPrice ?? 0, currency)} />
            <Fact label={t.intel.claimedSaving} value={fmt.percent(check.claimedDiscountPct)} />
            <Fact label={t.intel.realSaving} value={fmt.percent(check.realDiscountPct)} />
          </dl>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}
