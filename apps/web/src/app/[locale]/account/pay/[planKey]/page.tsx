'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, CheckCircle2, Clock, Copy, ExternalLink, Landmark, Smartphone, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { useCancelPayment, useMyPayments, useStartPayment, useSubmitPayment } from '@/lib/hooks/use-billing';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import type { ManualPayment, ManualPaymentMethod, PaymentDestinations } from '@/types/billing.types';
import { SignedInGate } from '../../signed-in-gate';

/**
 * Wallet / InstaPay checkout: send the money, then enter the transfer number.
 * The owner confirms by hand; this page polls until they do.
 */
export default function PayPage() {
  const { t } = useI18n();
  const { planKey } = useParams<{ planKey: string }>();
  return (
    <SignedInGate path={`/account/pay/${planKey}`} prompt={t.pay.signIn}>
      <PayContent planKey={planKey} />
    </SignedInGate>
  );
}

function PayContent({ planKey }: { planKey: string }) {
  const { t } = useI18n();
  const apiError = useApiErrorMessage();
  const start = useStartPayment();
  const { data: mine } = useMyPayments();
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const { mutate: startOrder } = start;
  useEffect(() => {
    startOrder(planKey, { onSuccess: (data) => setPaymentId(data.payment.id) });
  }, [planKey, startOrder]);

  if (start.isError) {
    return (
      <Shell>
        <ErrorState
          title={apiError(start.error)}
          action={
            <Link href="/account/billing" className={buttonClassName({ variant: 'secondary' })}>
              {t.pay.goToPlan}
            </Link>
          }
        />
      </Shell>
    );
  }

  // The polled list is fresher than the start response once it has loaded.
  const payment = mine?.payments.find((p) => p.id === paymentId) ?? start.data?.payment;
  const destinations = mine?.destinations ?? start.data?.destinations ?? null;

  if (!payment) {
    return (
      <Shell>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </Shell>
    );
  }

  return (
    <Shell>
      <Header payment={payment} />
      {payment.status === 'AWAITING_PAYMENT' && destinations && <PayForm payment={payment} destinations={destinations} />}
      {payment.status === 'SUBMITTED' && <Waiting payment={payment} />}
      {payment.status === 'APPROVED' && (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-success" />}
          title={t.pay.approvedTitle}
          description={t.pay.approvedBody}
          action={
            <Link href="/account/billing" className={buttonClassName()}>
              {t.pay.goToPlan}
            </Link>
          }
        />
      )}
      {(payment.status === 'REJECTED' || payment.status === 'CANCELLED') && (
        <EmptyState
          icon={<XCircle className="h-6 w-6" />}
          title={payment.status === 'REJECTED' ? t.pay.rejectedTitle : t.pay.cancelledTitle}
          description={payment.rejectReason ?? (payment.status === 'REJECTED' ? t.pay.rejectedBody : undefined)}
          action={
            <Button
              onClick={() => start.mutate(planKey, { onSuccess: (data) => setPaymentId(data.payment.id) })}
              loading={start.isPending}
            >
              {t.pay.tryAgain}
            </Button>
          }
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">{children}</div>;
}

function Header({ payment }: { payment: ManualPayment }) {
  const { t, tf, fmt } = useI18n();
  const planName = t.pricing.plans[payment.tier]?.name ?? payment.planName;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-fg">{tf(t.pay.title, { plan: planName })}</h1>
        <Badge variant="neutral">
          <span dir="ltr">{tf(t.pay.order, { code: payment.code })}</span>
        </Badge>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-fg">
        {tf(t.pay.amount, { amount: fmt.number(payment.amount), currency: payment.currency, days: payment.intervalDays })}
      </p>
      {payment.status === 'AWAITING_PAYMENT' && <p className="text-sm text-muted">{t.pay.lede}</p>}
    </header>
  );
}

function PayForm({ payment, destinations }: { payment: ManualPayment; destinations: PaymentDestinations }) {
  const { t, tf } = useI18n();
  const router = useRouter();
  const submit = useSubmitPayment();
  const cancel = useCancelPayment();
  const methods: ManualPaymentMethod[] = [
    ...(destinations.walletNumber ? (['WALLET'] as const) : []),
    ...(destinations.instapayAddress ? (['INSTAPAY'] as const) : []),
  ];
  const [method, setMethod] = useState<ManualPaymentMethod>(methods[0] ?? 'WALLET');
  const [reference, setReference] = useState('');
  const [payerAccount, setPayerAccount] = useState('');

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">{t.pay.step1}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {destinations.walletNumber && (
            <Destination
              icon={<Smartphone className="h-5 w-5" aria-hidden />}
              label={t.pay.wallet}
              hint={t.pay.walletHint}
              value={destinations.walletNumber}
            />
          )}
          {destinations.instapayAddress && (
            <Destination
              icon={<Landmark className="h-5 w-5" aria-hidden />}
              label={t.pay.instapay}
              hint={t.pay.instapayHint}
              value={destinations.instapayAddress}
              link={destinations.instapayLink}
            />
          )}
        </div>
        <p className="text-sm text-muted">
          {tf(t.pay.codeNote, { code: payment.code })}
        </p>
      </section>

      <Card>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate({ id: payment.id, method, reference: reference.trim(), payerAccount: payerAccount.trim() || undefined });
            }}
          >
            <h2 className="text-base font-semibold text-fg">{t.pay.step2}</h2>
            {methods.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t.pay.method}</legend>
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => (
                    <label
                      key={m}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm',
                        method === m ? 'border-brand bg-brand-soft text-fg' : 'border-border text-muted',
                      )}
                    >
                      <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-brand" />
                      {m === 'WALLET' ? t.pay.wallet : t.pay.instapay}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Input
              label={t.pay.reference}
              hint={t.pay.referenceHint}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              minLength={4}
              maxLength={64}
              inputMode="text"
              autoComplete="off"
              dir="ltr"
            />
            <Input
              label={t.pay.payerAccount}
              hint={t.pay.payerAccountHint}
              value={payerAccount}
              onChange={(e) => setPayerAccount(e.target.value)}
              maxLength={64}
              autoComplete="tel"
              dir="ltr"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={submit.isPending} disabled={reference.trim().length < 4}>
                {t.pay.submit}
              </Button>
              <Button
                type="button"
                variant="ghost"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(payment.id, { onSuccess: () => router.push('/pricing') })}
              >
                {t.pay.cancel}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}

function Destination({
  icon,
  label,
  hint,
  value,
  link,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: string;
  link?: string | null;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-fg">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="select-all text-lg font-semibold tabular-nums text-fg" dir="ltr">
          {value}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          leftIcon={copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // No clipboard (http, old browser): the number is selectable.
            }
          }}
        >
          {copied ? t.pay.copied : t.pay.copy}
        </Button>
      </div>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClassName({ className: 'w-full' })}>
          {t.pay.openInstapay}
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

function Waiting({ payment }: { payment: ManualPayment }) {
  const { t } = useI18n();
  const cancel = useCancelPayment();
  return (
    <EmptyState
      icon={<Clock className="h-6 w-6" />}
      title={t.pay.waitingTitle}
      description={t.pay.waitingBody}
      action={
        <>
          <Link href="/account/billing" className={buttonClassName({ variant: 'secondary' })}>
            {t.pay.goToPlan}
          </Link>
          <Button variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(payment.id)}>
            {t.pay.cancel}
          </Button>
        </>
      }
    />
  );
}
