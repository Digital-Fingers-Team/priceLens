import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { FeeTables } from '@/components/admin/fee-tables';

export const metadata: Metadata = { title: 'Platform fees — Admin', robots: NOINDEX };

export default function AdminFeeTablesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Platform fees</h1>
        <p className="text-sm text-muted mt-1">
          Commission and per-order fees for each store, used by sellers&apos; profit calculator and best-platform finder.
          Enter them from each store&apos;s published seller fee schedule; sellers see the date of the last update. A
          category row (by category slug) beats the store default.
        </p>
      </div>
      <FeeTables />
    </div>
  );
}
