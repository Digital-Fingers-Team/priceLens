'use client';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import type { BuyVerdict, CurrentMarket, HistoryStats } from '@/types/intelligence.types';

const TONE: Record<BuyVerdict['verdict'], { text: string; border: string }> = {
  GOOD_TIME_TO_BUY: { text: 'text-success', border: 'border-s-success' },
  FAIR_PRICE: { text: 'text-info', border: 'border-s-info' },
  WAIT: { text: 'text-warning', border: 'border-s-warning' },
  INSUFFICIENT_DATA: { text: 'text-muted', border: 'border-s-border-strong' },
};

const CONFIDENCE: Record<string, BadgeVariant> = { HIGH: 'success', MEDIUM: 'info', LOW: 'outline' };

interface BuyVerdictCardProps {
  verdict: BuyVerdict;
  market: CurrentMarket;
  history: HistoryStats | null;
  currency: string;
  windowDays: number;
}

export function BuyVerdictCard({ verdict, market, history, currency, windowDays }: BuyVerdictCardProps) {
  const { t, tf, fmt } = useI18n();
  const tone = TONE[verdict.verdict];

  return (
    <div className={cn('flex flex-col gap-4 rounded border border-border border-s-4 bg-surface p-4 sm:p-6', tone.border)}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className={cn('text-base font-semibold', tone.text)}>{t.intel.verdicts[verdict.verdict]}</h3>
        {verdict.confidence && (
          <Badge variant={CONFIDENCE[verdict.confidence] ?? 'outline'}>{t.intel.confidence[verdict.confidence]}</Badge>
        )}
      </div>

      {/* The evidence, always. A verdict without its basis is just an opinion. */}
      {history && market.best != null && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label={t.intel.current} value={fmt.currency(market.best, currency)} emphasis />
          <Stat label={tf(t.intel.windowLow, { days: windowDays })} value={fmt.currency(history.low, currency)} />
          <Stat label={tf(t.intel.windowAverage, { days: windowDays })} value={fmt.currency(history.average, currency)} />
          <Stat label={tf(t.intel.windowHigh, { days: windowDays })} value={fmt.currency(history.high, currency)} />
        </dl>
      )}

      {/* Reasons are written by the API (English in both UIs for now). */}
      <ul className="flex list-disc flex-col gap-1 ps-4 text-sm text-muted marker:text-border-strong" dir="auto">
        {verdict.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {history && (
        <p className="text-xs text-muted">
          {tf(t.intel.basedOn, { days: history.dayCount, from: fmt.date(history.firstDate), to: fmt.date(history.lastDate) })}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className={cn('truncate text-sm font-semibold tabular-nums', emphasis ? 'text-fg' : 'text-muted')}>{value}</dd>
    </div>
  );
}
