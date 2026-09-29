import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { PaymentsQueue } from '@/components/admin/payments-queue';

export const metadata: Metadata = { title: 'Payments — Admin', robots: NOINDEX };

export default function AdminPaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Payments</h1>
        <p className="text-sm text-muted mt-1">
          Wallet and InstaPay payments. Check the amount and the transfer number against the SMS on your phone,
          then approve to activate the plan.
        </p>
      </div>
      <PaymentsQueue />
    </div>
  );
}
