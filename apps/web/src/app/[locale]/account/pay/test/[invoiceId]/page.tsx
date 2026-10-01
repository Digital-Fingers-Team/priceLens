'use client';

import { useParams } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useInvoice, useTestPay } from '@/lib/hooks/use-billing';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { SignedInGate } from '../../../signed-in-gate';

/**
 * The test double's "hosted checkout". Its buttons go through the same
 * signature check and settlement as a real gateway callback. The API refuses
 * them unless the mock_checkout flag is on (and, in production, the caller is
 * an admin).
 */
export default function TestPayPage() {
  const { t } = useI18n();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  return (
    <SignedInGate path={`/account/pay/test/${invoiceId}`} prompt={t.pay.signIn}>
      <TestPay invoiceId={invoiceId} />
    </SignedInGate>
  );
}

function TestPay({ invoiceId }: { invoiceId: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const apiError = useApiErrorMessage();
  const { data: invoice, isLoading, error } = useInvoice(invoiceId);
  const pay = useTestPay();

  const finish = (outcome: 'PAID' | 'FAILED') =>
    pay.mutate({ id: invoiceId, outcome }, { onSuccess: () => router.replace(`/account/invoices?invoice=${invoiceId}`) });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : error || !invoice ? (
        <ErrorState title={apiError(error)} />
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
              <FlaskConical className="h-5 w-5 text-warning" aria-hidden />
              {t.pay.testTitle}
            </h1>
            <p className="text-sm text-muted">{t.pay.testLede}</p>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {fmt.currency(invoice.amountMinor / 100, invoice.currency)}
            </p>
            {pay.error && <p className="text-sm text-danger">{apiError(pay.error)}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button loading={pay.isPending && pay.variables?.outcome === 'PAID'} onClick={() => finish('PAID')}>
                {t.pay.testPay}
              </Button>
              <Button variant="secondary" loading={pay.isPending && pay.variables?.outcome === 'FAILED'} onClick={() => finish('FAILED')}>
                {t.pay.testDecline}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
