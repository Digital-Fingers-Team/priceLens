'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface UpgradePromptProps {
  title: string;
  /** What they actually get — concrete, not "unlock premium". */
  description: string;
  className?: string;
  compact?: boolean;
}

/**
 * The paywall surface.
 *
 * Deliberately states what the feature *does* rather than shouting PREMIUM:
 * the free tier is the funnel, so the prompt has to read as a useful next step
 * instead of a wall. Never used as a security boundary — every gate is
 * enforced server-side as well.
 */
export function UpgradePrompt({ title, description, className, compact }: UpgradePromptProps) {
  if (compact) {
    return (
      <Link
        href="/pricing"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2',
          'text-xs text-amber-200/90 transition-colors hover:border-amber-500/50 hover:bg-amber-500/10',
          className,
        )}
      >
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="shrink-0 font-medium text-amber-300">Upgrade</span>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] to-transparent p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2">
          <Sparkles className="h-4 w-4 text-amber-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">{description}</p>
          <Link
            href="/pricing"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
          >
            See plans
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown where we genuinely have nothing to say, as opposed to something we
 * are withholding. Keeping these visually distinct from UpgradePrompt matters:
 * conflating "we don't know" with "pay us" is exactly the pattern that makes
 * price trackers untrustworthy.
 */
export function InsufficientData({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-ink-700 bg-ink-900/50 p-5', className)}>
      <p className="text-sm font-medium text-ink-300">Insufficient data</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">{message}</p>
    </div>
  );
}
