'use client';

import { ArrowRight, CreditCard } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBillingPortal, useCancelSubscription, useMyBilling, useMyPayments } from '@/lib/hooks/use-billing';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { SignedInGate } from '../signed-in-gate';
import { planWords } from '@/lib/billing/plan-words';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  TRIALING: 'info',
  PAST_DUE: 'warning',
  CANCELED: 'danger',
  INCOMPLETE: 'warning',
  EXPIRED: 'danger',
};

export default function BillingPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/account/billing" prompt={t.account.signInForPlan}>
      <BillingContent />
    </SignedInGate>
  );
}

function BillingContent() {
  const { t, tf, fmt } = useI18n();
  const { data, isLoading } = useMyBilling();
  const { mutate: openPortal, isPending: portalPending } = useBillingPortal();
  const { mutate: cancel, isPending: cancelPending } = useCancelSubscription();
  const { data: payments } = useMyPayments();
  const waiting = payments?.payments.find((p) => p.status === 'SUBMITTED');

  if (isLoading || !data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  const isPaid = data.tier !== 'FREE';
  // Wallet, InstaPay and Paymob plans end on their date unless paid again.
  const isWallet = ['wallet', 'paymob', 'mock'].includes(data.provider ?? '');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-fg">{t.account.planTitle}</h1>
        <p className="text-sm text-muted">{t.account.planLede}</p>
      </header>

      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-fg">{planWords(t, { key: data.planKey, tier: data.tier, name: data.planName }).name}</h2>
            {data.currentPeriodEnd && (
              <p className="text-xs text-muted">
                {tf(data.cancelAtPeriodEnd || isWallet ? t.account.accessEnds : t.account.renews, { date: fmt.date(data.currentPeriodEnd) })}
              </p>
            )}
          </div>
          {data.status && (
            <Badge variant={STATUS_VARIANT[data.status] ?? 'neutral'}>
              {(t.account.status as Record<string, string>)[data.status] ?? data.status}
            </Badge>
          )}
        </CardHeader>

        <CardBody className="flex flex-col gap-6">
          {waiting && (
            <p className="rounded border border-info/40 bg-info-soft px-3 py-2 text-sm text-fg">
              {tf(t.account.paymentWaiting, { amount: `${fmt.number(waiting.amount)} ${waiting.currency}` })}
            </p>
          )}
          {isWallet && data.currentPeriodEnd && <p className="text-xs text-muted">{t.account.walletNoAutoRenew}</p>}
          {data.status === 'PAST_DUE' && (
            <p className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-fg">{t.account.pastDue}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <UsageMeter label={t.account.trackedProducts} used={data.usage.trackedProducts} limit={data.limits.trackedProducts} />
            <UsageMeter label={t.account.activeAlerts} used={data.usage.activeAlerts} limit={data.limits.activeAlerts} />
          </div>

          <dl className="grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="label-mono text-muted">{t.product.priceHistory}</dt>
              <dd className="text-fg">
                {data.limits.priceHistoryDays === null
                  ? t.account.fullHistory
                  : tf(t.account.days, { days: data.limits.priceHistoryDays })}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono text-muted">{t.account.alertTypes}</dt>
              <dd className="text-fg">{tf(t.account.available, { count: data.limits.alertTypes.length })}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="label-mono text-muted">{t.account.channels}</dt>
              <dd className="text-fg">{data.limits.notificationChannels.map((c) => t.account.channelNames[c]).join(t.account.listSeparator)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {isPaid && !isWallet && data.checkoutEnabled && (
              <Button variant="secondary" leftIcon={<CreditCard className="h-4 w-4" aria-hidden />} loading={portalPending} onClick={() => openPortal()}>
                {t.account.paymentInvoices}
              </Button>
            )}
            {isWallet && (
              <Link href={`/account/pay/${data.planKey}`} className={buttonClassName()}>
                {t.account.renewNow}
              </Link>
            )}
            <Link href="/account/invoices" className={buttonClassName({ variant: 'secondary' })}>
              {t.account.invoicesLink}
            </Link>
            <Link href="/pricing" className={buttonClassName({ variant: isPaid ? 'secondary' : 'primary' })}>
              {isPaid ? t.account.changePlan : t.billing.seePlans}
              <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
            </Link>
            {isPaid && !isWallet && !data.cancelAtPeriodEnd && (
              <Button variant="danger" loading={cancelPending} onClick={() => cancel(false)}>
                {t.account.cancelRenewal}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-muted">
        {t.account.needSeller}{' '}
        <Link href="/pricing" className="text-brand hover:underline">
          {t.account.seeIncluded}
        </Link>
      </p>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t, fmt } = useI18n();
  // A null limit is unlimited, not zero — rendering a full bar there would be
  // exactly backwards.
  const pct = limit === null ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  const nearLimit = limit !== null && pct >= 80;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-mono text-muted">{label}</span>
        <span className={cn('text-sm font-medium tabular-nums', nearLimit ? 'text-warning' : 'text-fg')} dir="ltr">
          {fmt.number(used)}
          {limit === null ? '' : ` / ${fmt.number(limit)}`}
        </span>
      </div>
      {limit === null ? (
        <p className="text-xs text-muted">{t.account.unlimited}</p>
      ) : (
        <div
          className="h-1 overflow-hidden rounded-full bg-surface-2"
          role="meter"
          aria-label={label}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
        >
          <div className={cn('h-full rounded-full', nearLimit ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
