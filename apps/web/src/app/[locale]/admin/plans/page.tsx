import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { PlansEditor } from '@/components/admin/plans-editor';

export const metadata: Metadata = { title: 'Plans — Admin', robots: NOINDEX };

export default function AdminPlansPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Plans</h1>
        <p className="text-sm text-muted mt-1">
          Prices, limits and features per plan. Running subscriptions pick up a change within a minute. A price change
          applies to new payments only; an open invoice keeps the price it was created with.
        </p>
      </div>
      <PlansEditor />
    </div>
  );
}
