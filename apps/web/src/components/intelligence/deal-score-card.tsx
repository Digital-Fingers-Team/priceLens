'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { DealScore } from '@/types/intelligence.types';

const GRADE_COLOR = {
  EXCELLENT: { text: 'text-emerald-400', ring: 'stroke-emerald-400' },
  GOOD: { text: 'text-blue-400', ring: 'stroke-blue-400' },
  FAIR: { text: 'text-amber-400', ring: 'stroke-amber-400' },
  POOR: { text: 'text-red-400', ring: 'stroke-red-400' },
} as const;

export function DealScoreCard({ dealScore }: { dealScore: DealScore }) {
  const [showMethod, setShowMethod] = useState(false);

  if (dealScore.score === null) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/50 p-5">
        <h3 className="text-sm font-semibold text-ink-300">Deal score unavailable</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">
          We could only measure {Math.round(dealScore.coverage * 100)}% of the signals this score needs.
          Publishing a number from that would be guesswork.
        </p>
        <SignalList signals={dealScore.signals} />
      </div>
    );
  }

  const grade = dealScore.grade ? GRADE_COLOR[dealScore.grade] : GRADE_COLOR.FAIR;
  const circumference = 2 * Math.PI * 26;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" strokeWidth="5" className="stroke-ink-700" />
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
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums',
              grade.text,
            )}
          >
            {dealScore.score}
          </span>
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-100">
            Deal score: <span className={grade.text}>{dealScore.grade?.toLowerCase()}</span>
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            {dealScore.coverage === 1
              ? 'All signals measured.'
              : `${Math.round(dealScore.coverage * 100)}% of signals measured; the rest were excluded, not guessed.`}
          </p>
        </div>
      </div>

      <SignalList signals={dealScore.signals} />

      <button
        type="button"
        onClick={() => setShowMethod((open) => !open)}
        aria-expanded={showMethod}
        className="mt-3 flex w-full items-center gap-1.5 text-xs text-ink-500 transition-colors hover:text-ink-300"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        How this is calculated
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMethod && 'rotate-180')} aria-hidden />
      </button>
      {showMethod && (
        <p className="mt-2 rounded-lg bg-ink-950/60 p-3 text-xs leading-relaxed text-ink-400">
          {dealScore.methodology}
        </p>
      )}
    </div>
  );
}

function SignalList({ signals }: { signals: DealScore['signals'] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {signals.map((signal) => (
        <li key={signal.key} className="text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('font-medium', signal.available ? 'text-ink-300' : 'text-ink-600')}>
              {signal.label}
            </span>
            <span className={cn('shrink-0 tabular-nums', signal.available ? 'text-ink-400' : 'text-ink-600')}>
              {signal.score != null ? `${Math.round(signal.score)}/100` : 'not measured'}
            </span>
          </div>
          {/* A bar is only drawn for a real measurement; an absent signal
              renders as text so it cannot be misread as a low score. */}
          {signal.score != null && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-ink-500" style={{ width: `${signal.score}%` }} />
            </div>
          )}
          <p className={cn('mt-1', signal.available ? 'text-ink-500' : 'text-ink-600 italic')}>{signal.detail}</p>
        </li>
      ))}
    </ul>
  );
}
