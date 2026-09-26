'use client';

import Link from 'next/link';
import { CreditCard, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBillingPortal, useCancelSubscription, useMyBilling } from '@/lib/hooks/use-billing';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';

const STATUS_VARIANT = {
  ACTIVE: 'success',
  TRIALING: 'info',
  PAST_DUE: 'warning',
  CANCELED: 'danger',
  INCOMPLETE: 'warning',
  EXPIRED: 'danger',
} as const;

export default function BillingPage() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const { data, isLoading } = useMyBilling();
  const { mutate: openPortal, isPending: portalPending } = useBillingPortal();
  const { mutate: cancel, isPending: cancelPending } = useCancelSubscription();

  // Until the stored session is read, "signed out" is not known yet.
  if (!hasHydrated) {
    return <div className="mx-auto max-w-2xl px-4 py-12" aria-busy="true" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-ink-400">
          <Link href="/login" className="text-signal hover:underline">
            Sign in
          </Link>{' '}
          to see your plan.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  const isPaid = data.tier !== 'FREE';

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-50">Your plan</h1>
        <p className="mt-1 text-sm text-ink-400">Manage your subscription and see what you are using.</p>
      </header>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-50">{data.planName}</h2>
            {data.currentPeriodEnd && (
              <p className="mt-0.5 text-xs text-ink-500">
                {data.cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                {new Date(data.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          {data.status && (
            <Badge variant={STATUS_VARIANT[data.status] ?? 'default'}>{data.status.toLowerCase()}</Badge>
          )}
        </CardHeader>

        <CardBody className="space-y-4">
          {data.status === 'PAST_DUE' && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-200">
              Your last payment did not go through. You still have access — update your card to keep it.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <UsageMeter
              label="Tracked products"
              used={data.usage.trackedProducts}
              limit={data.limits.trackedProducts}
            />
            <UsageMeter label="Active alerts" used={data.usage.activeAlerts} limit={data.limits.activeAlerts} />
          </div>

          <dl className="grid gap-3 border-t border-ink-800 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-500">Price history</dt>
              <dd className="mt-0.5 text-ink-200">
                {data.limits.priceHistoryDays === null
                  ? 'Full recorded history'
                  : `${data.limits.priceHistoryDays} days`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Alert types</dt>
              <dd className="mt-0.5 text-ink-200">{data.limits.alertTypes.length} available</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Delivery channels</dt>
              <dd className="mt-0.5 text-ink-200">
                {data.limits.notificationChannels.map((c) => c.toLowerCase().replace('_', '-')).join(', ')}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3 border-t border-ink-800 pt-4">
            {isPaid && data.checkoutEnabled && (
              <Button
                variant="ghost"
                leftIcon={<CreditCard className="h-4 w-4" />}
                loading={portalPending}
                onClick={() => openPortal()}
              >
                Payment & invoices
              </Button>
            )}
            <Link href="/pricing" className={buttonClassName({ variant: isPaid ? 'ghost' : 'primary' })}>
              {isPaid ? 'Change plan' : 'See plans'}
              <ExternalLink className="h-4 w-4" />
            </Link>
            {isPaid && !data.cancelAtPeriodEnd && (
              <Button
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                loading={cancelPending}
                onClick={() => cancel(false)}
              >
                Cancel renewal
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-ink-600">
        Need a seller or enterprise plan?{' '}
        <Link href="/pricing" className="text-ink-400 hover:underline">
          See what is included
        </Link>
        .
      </p>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  // A null limit is unlimited, not zero — rendering a full bar there would be
  // exactly backwards.
  const pct = limit === null ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  const nearLimit = limit !== null && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-500">{label}</span>
        <span className={cn('text-xs font-medium tabular-nums', nearLimit ? 'text-amber-400' : 'text-ink-300')}>
          {used.toLocaleString()} {limit === null ? '' : `/ ${limit.toLocaleString()}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className={cn('h-full rounded-full transition-all', nearLimit ? 'bg-amber-500' : 'bg-signal')}
          style={{ width: limit === null ? '100%' : `${pct}%` }}
        />
      </div>
      {limit === null && <p className="mt-1 text-[0.7rem] text-ink-600">Unlimited on your plan</p>}
    </div>
  );
}
