'use client';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';

const sizes = {
  sm: 'text-sm font-medium',
  md: 'text-base font-semibold',
  lg: 'text-2xl font-semibold',
} as const;

interface PriceTagProps {
  amount: number | null | undefined;
  currency?: string | null;
  size?: keyof typeof sizes;
  /** Brand color for the price that matters most (best price). */
  emphasis?: boolean;
  /** A previous/advertised price, struck through. */
  was?: number | null;
  className?: string;
}

/** One way to print a price: tabular digits, locale format, optional was-price. */
export function PriceTag({ amount, currency, size = 'md', emphasis, was, className }: PriceTagProps) {
  const { fmt } = useI18n();
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('whitespace-nowrap tabular-nums', sizes[size], emphasis ? 'text-brand' : 'text-fg')}>
        {fmt.currency(amount, currency)}
      </span>
      {was != null && amount != null && was > amount && (
        <s className="whitespace-nowrap text-xs tabular-nums text-muted">{fmt.currency(was, currency)}</s>
      )}
    </span>
  );
}
