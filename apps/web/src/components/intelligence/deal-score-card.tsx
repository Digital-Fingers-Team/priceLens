'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import type { DealScore } from '@/types/intelligence.types';

const GRADE_COLOR = {
  EXCELLENT: { text: 'text-success', ring: 'stroke-success' },
  GOOD: { text: 'text-info', ring: 'stroke-info' },
  FAIR: { text: 'text-warning', ring: 'stroke-warning' },
  POOR: { text: 'text-danger', ring: 'stroke-danger' },
} as const;

export function DealScoreCard({ dealScore }: { dealScore: DealScore }) {
  const { t, tf, fmt } = useI18n();
  const [showMethod, setShowMethod] = useState(false);
  const methodId = useId();
  const coverage = fmt.percent(dealScore.coverage * 100);

  if (dealScore.score === null) {
    return (
      <div className="flex flex-col gap-1 rounded border border-dashed border-border-strong p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-fg">{t.intel.scoreUnavailable}</h3>
        <p className="text-sm text-muted">{tf(t.intel.scoreUnavailableBody, { coverage })}</p>
        <SignalList signals={dealScore.signals} />
      </div>
    );
  }

  const grade = dealScore.grade ? GRADE_COLOR[dealScore.grade] : GRADE_COLOR.FAIR;
  const circumference = 2 * Math.PI * 26;

  return (
    <div className="flex flex-col gap-4 rounded border border-border bg-surface p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" strokeWidth="5" className="stroke-border" />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className={grade.ring}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - dealScore.score / 100)}
            />
          </svg>
          <span className={cn('absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums', grade.text)}>
            {dealScore.score}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg">
            {t.intel.dealScore}: <span className={grade.text}>{dealScore.grade ? t.intel.grades[dealScore.grade] : ''}</span>
          </h3>
          <p className="text-xs text-muted">
            {dealScore.coverage === 1 ? t.intel.allSignals : tf(t.intel.someSignals, { coverage })}
          </p>
        </div>
      </div>

      <SignalList signals={dealScore.signals} />

      <button
        type="button"
        onClick={() => setShowMethod((open) => !open)}
        aria-expanded={showMethod}
        aria-controls={methodId}
        className="flex w-full items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
      >
        {t.intel.howCalculated}
        <ChevronDown className={cn('h-4 w-4 transition-transform', showMethod && 'rotate-180')} aria-hidden />
      </button>
      {showMethod && (
        <p id={methodId} className="rounded-sm bg-surface-2 p-3 text-xs text-muted" dir="auto">
          {dealScore.methodology}
        </p>
      )}
    </div>
  );
}

function SignalList({ signals }: { signals: DealScore['signals'] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-3">
      {signals.map((signal) => (
        <li key={signal.key} className="flex flex-col gap-1 text-xs" dir="auto">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('font-medium', signal.available ? 'text-fg' : 'text-muted')}>{signal.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {signal.score != null ? `${Math.round(signal.score)}/100` : t.intel.notMeasured}
            </span>
          </div>
          {/* A bar is only drawn for a real measurement; an absent signal
              renders as text so it cannot be misread as a low score. */}
          {signal.score != null && (
            <div className="h-1 overflow-hidden rounded-full bg-surface-2" dir="ltr">
              <div className="h-full rounded-full bg-border-strong" style={{ width: `${signal.score}%` }} />
            </div>
          )}
          <p className="text-muted">{signal.detail}</p>
        </li>
      ))}
    </ul>
  );
}
