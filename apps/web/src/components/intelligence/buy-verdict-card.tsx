'use client';

import { CheckCircle2, CircleDashed, Clock, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { BuyVerdict, CurrentMarket, HistoryStats } from '@/types/intelligence.types';

const VERDICT_PRESENTATION = {
  GOOD_TIME_TO_BUY: {
    label: 'Good time to buy',
    icon: CheckCircle2,
    ring: 'border-emerald-500/30 bg-emerald-500/[0.07]',
    text: 'text-emerald-400',
  },
  FAIR_PRICE: {
    label: 'Fair price',
    icon: CircleDashed,
    ring: 'border-blue-500/30 bg-blue-500/[0.07]',
    text: 'text-blue-400',
  },
  WAIT: {
    label: 'Wait',
    icon: Clock,
    ring: 'border-amber-500/30 bg-amber-500/[0.07]',
    text: 'text-amber-400',
  },
  INSUFFICIENT_DATA: {
    label: 'Not enough data yet',
    icon: HelpCircle,
    ring: 'border-ink-700 bg-ink-900/60',
    text: 'text-ink-400',
  },
} as const;

interface BuyVerdictCardProps {
  verdict: BuyVerdict;
  market: CurrentMarket;
  history: HistoryStats | null;
  currency: string;
  windowDays: number;
}

export function BuyVerdictCard({ verdict, market, history, currency, windowDays }: BuyVerdictCardProps) {
  const presentation = VERDICT_PRESENTATION[verdict.verdict];
  const Icon = presentation.icon;

  return (
    <div className={cn('rounded-xl border p-5', presentation.ring)}>
      <div className="flex flex-wrap items-center gap-3">
        <Icon className={cn('h-5 w-5 shrink-0', presentation.text)} aria-hidden />
        <h3 className={cn('text-base font-semibold', presentation.text)}>{presentation.label}</h3>
        {verdict.confidence && (
          <Badge variant={verdict.confidence === 'HIGH' ? 'success' : verdict.confidence === 'MEDIUM' ? 'info' : 'outline'}>
            {verdict.confidence.toLowerCase()} confidence
          </Badge>
        )}
      </div>

      {/* The evidence, always. A verdict without its basis is just an opinion. */}
      {history && market.best != null && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Current" value={formatPrice(market.best, currency)} emphasis />
          <Stat label={`${windowDays}-day low`} value={formatPrice(history.low, currency)} />
          <Stat label={`${windowDays}-day average`} value={formatPrice(history.average, currency)} />
          <Stat label={`${windowDays}-day high`} value={formatPrice(history.high, currency)} />
        </dl>
      )}

      <ul className="mt-4 space-y-1.5">
        {verdict.reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink-400">
            <span aria-hidden className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {history && (
        <p className="mt-3 text-xs text-ink-600">
          Based on {history.dayCount} day(s) of prices we recorded ourselves between {history.firstDate} and{' '}
          {history.lastDate}.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-ink-500">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm font-semibold tabular-nums', emphasis ? 'text-ink-50' : 'text-ink-300')}>
        {value}
      </dd>
    </div>
  );
}
