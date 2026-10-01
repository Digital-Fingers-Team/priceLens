'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, THead, Td, Th } from '@/components/ui/table';
import { planWords } from '@/lib/billing/plan-words';
import { useInvoice, useInvoices } from '@/lib/hooks/use-billing';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { InvoiceStatus } from '@/types/billing.types';
import { SignedInGate } from '../signed-in-gate';

const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  CANCELED: 'neutral',
  REFUNDED: 'info',
};

export default function InvoicesPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/account/invoices" prompt={t.invoices.signIn}>
      {/* useSearchParams needs a boundary to prerender. */}
      <Suspense>
        <InvoicesContent />
      </Suspense>
    </SignedInGate>
  );
}

function InvoicesContent() {
  const { t, fmt } = useI18n();
  // Paymob sends the customer back here with ?invoice=<id>.
  const returned = useSearchParams().get('invoice');
  const { data, isLoading } = useInvoices();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-fg">{t.invoices.title}</h1>
        <p className="text-sm text-muted">{t.invoices.lede}</p>
      </header>

      {returned && <ReturnedInvoice id={returned} />}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data || data.invoices.length === 0 ? (
        <EmptyState title={t.invoices.empty} />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>{t.invoices.date}</Th>
                <Th>{t.invoices.plan}</Th>
                <Th align="end">{t.invoices.amount}</Th>
                <Th>{t.invoices.method}</Th>
                <Th>{t.invoices.statusLabel}</Th>
              </tr>
            </THead>
            <TBody>
              {data.invoices.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <Td className="whitespace-nowrap">{fmt.date(row.createdAt)}</Td>
                  <Td>
                    {planWords(t, { key: row.planKey, tier: '', name: row.planName }).name}
                    {row.reference && (
                      <span className="block text-xs text-muted" dir="ltr">
                        {row.reference}
                      </span>
                    )}
                  </Td>
                  <Td align="end" className="tabular-nums">
                    {fmt.currency(row.amountMinor / 100, row.currency)}
                  </Td>
                  <Td>{t.invoices.providers[row.provider as keyof typeof t.invoices.providers] ?? row.provider}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{t.invoices.status[row.status] ?? row.status}</Badge>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/** The invoice the customer just paid: polled until the gateway's callback settles it. */
function ReturnedInvoice({ id }: { id: string }) {
  const { t } = useI18n();
  const { data } = useInvoice(id);
  if (!data) return null;

  if (data.status === 'PENDING') {
    return (
      <EmptyState
        icon={<Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
        title={t.invoices.checkingTitle}
        description={t.invoices.checkingBody}
      />
    );
  }
  if (data.status === 'PAID') {
    return (
      <Card>
        <CardBody className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div className="flex flex-1 flex-col gap-2">
            <p className="font-semibold text-fg">{t.invoices.paidTitle}</p>
            <p className="text-sm text-muted">{t.invoices.paidBody}</p>
            <Link href="/account/billing" className={buttonClassName({ size: 'sm', className: 'self-start' })}>
              {t.invoices.viewPlan}
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <XCircle className="mt-1 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="flex flex-1 flex-col gap-2">
          <p className="font-semibold text-fg">{t.invoices.failedTitle}</p>
          <p className="text-sm text-muted">{t.invoices.failedBody}</p>
          <Link href={`/account/pay/${data.planKey}`} className={buttonClassName({ size: 'sm', variant: 'secondary', className: 'self-start' })}>
            {t.invoices.tryAgain}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
