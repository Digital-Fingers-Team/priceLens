'use client';

import { ArrowRight, Lock } from 'lucide-react';
import { buttonClassName } from '@/components/ui/button-styles';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';

interface UpgradePromptProps {
  title: string;
  /**
   * What they actually get — concrete, not "unlock premium". Optional only
   * for the compact variant, which renders a single line.
   */
  description?: string;
  className?: string;
  compact?: boolean;
  /** Defaults to the pricing page. A sign-in prompt passes its own. */
  action?: { href: string; label: string };
  /** h3 under a section; h2 when it sits straight under the page's h1. */
  headingLevel?: 'h2' | 'h3';
}

/**
 * The paywall surface.
 *
 * Deliberately states what the feature *does* rather than shouting PREMIUM:
 * the free tier is the funnel, so the prompt has to read as a useful next step
 * instead of a wall. Never used as a security boundary — every gate is
 * enforced server-side as well.
 */
export function UpgradePrompt({ title, description, className, compact, action, headingLevel: Heading = 'h3' }: UpgradePromptProps) {
  const { t } = useI18n();
  const target = action ?? { href: '/pricing', label: t.billing.seePlans };

  if (compact) {
    return (
      <Link
        href="/pricing"
        className={cn(
          'flex items-center gap-2 rounded border border-brand/30 bg-brand-soft/60 px-3 py-2 text-xs text-brand-soft-fg transition-colors hover:border-brand',
          className,
        )}
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
        <span className="label-mono shrink-0">{t.billing.upgrade}</span>
      </Link>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded border border-brand/30 bg-brand-soft/60 p-4 sm:p-6', className)}>
      <div className="flex flex-col gap-1">
        <Heading className="text-sm font-semibold text-fg">{title}</Heading>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <Link href={target.href} className={buttonClassName({ size: 'sm', className: 'self-start' })}>
        {target.label}
        <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
      </Link>
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
  const { t } = useI18n();
  return (
    <div className={cn('rounded border border-dashed border-border-strong p-4', className)}>
      <p className="text-sm font-medium text-fg">{t.intel.insufficientData}</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
    </div>
  );
}
