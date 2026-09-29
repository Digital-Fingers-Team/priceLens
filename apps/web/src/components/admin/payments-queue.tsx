'use client';
import { useState } from 'react';
import { Check, Wallet, X } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminPayments, useReviewPayment } from '@/lib/hooks/use-billing';
import { cn } from '@/lib/utils/cn';
import type { AdminManualPayment, ManualPaymentStatus } from '@/types/billing.types';

const STATUS_VARIANT: Record<ManualPaymentStatus, BadgeVariant> = {
  AWAITING_PAYMENT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

const VIEWS: Array<{ label: string; status?: ManualPaymentStatus }> = [
  { label: 'To check', status: 'SUBMITTED' },
  { label: 'All' },
];

export function PaymentsQueue() {
  const [view, setView] = useState(0);
  const { data, isLoading, isFetching } = useAdminPayments(VIEWS[view].status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {VIEWS.map((v, i) => (
          <button
            key={v.label}
            type="button"
            onClick={() => setView(i)}
            className={cn(
              'rounded px-3 py-2 text-sm font-medium',
              view === i ? 'bg-brand-soft text-brand border border-brand/20' : 'text-muted hover:bg-surface-2',
            )}
          >
            {v.label}
          </button>
        ))}
        {isFetching && <span className="text-xs text-muted animate-pulse">Refreshing…</span>}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded" />
          ))}
        </div>
      ) : !data || data.payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Wallet className="w-8 h-8 text-muted mb-4" aria-hidden />
          <h3 className="font-semibold text-muted">Nothing to check</h3>
          <p className="text-sm text-muted mt-1">New payments appear here and on Telegram.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.payments.map((payment) => (
            <PaymentCard key={payment.id} payment={payment} />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentCard({ payment }: { payment: AdminManualPayment }) {
  const review = useReviewPayment();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const open = payment.status === 'SUBMITTED' || payment.status === 'AWAITING_PAYMENT';
  const busy = review.isPending;

  return (
    <div className="rounded border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tabular-nums text-fg">
            {payment.amount.toLocaleString('en-US')} {payment.currency}
            <span className="ms-2 text-sm font-normal text-muted">{payment.planName}</span>
          </p>
          <p className="text-sm text-muted">
            {payment.user.displayName ?? payment.user.username} · {payment.user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono">{payment.code}</span>
          <Badge variant={STATUS_VARIANT[payment.status]}>{payment.status.replace('_', ' ').toLowerCase()}</Badge>
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-4">
        <Item label="Via" value={payment.method === 'INSTAPAY' ? 'InstaPay' : payment.method === 'WALLET' ? 'Wallet' : '—'} />
        <Item label="Transfer number" value={payment.reference ?? '—'} mono />
        <Item label="Sent from" value={payment.payerAccount ?? '—'} mono />
        <Item
          label={payment.submittedAt ? 'Sent' : 'Ordered'}
          value={new Date(payment.submittedAt ?? payment.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        />
      </dl>

      {payment.rejectReason && <p className="text-sm text-danger">Rejected: {payment.rejectReason}</p>}

      {open && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          {rejecting ? (
            <>
              <Input
                label="Reason (the customer sees it)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={255}
                wrapperClassName="sm:max-w-sm"
                placeholder="No transfer with this number"
              />
              <Button
                variant="danger"
                loading={busy}
                onClick={() => review.mutate({ id: payment.id, decision: 'reject', reason: reason.trim() || undefined })}
              >
                Reject
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Button
                leftIcon={<Check className="h-4 w-4" aria-hidden />}
                loading={busy}
                onClick={() => review.mutate({ id: payment.id, decision: 'approve' })}
              >
                Approve
              </Button>
              <Button variant="secondary" leftIcon={<X className="h-4 w-4" aria-hidden />} onClick={() => setRejecting(true)} disabled={busy}>
                Reject
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className={cn('text-fg break-all', mono && 'font-mono')} dir="ltr">
        {value}
      </dd>
    </div>
  );
}
