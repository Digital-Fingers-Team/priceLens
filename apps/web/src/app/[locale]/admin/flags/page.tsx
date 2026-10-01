import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { FlagsTable } from '@/components/admin/flags-table';

export const metadata: Metadata = { title: 'Feature flags — Admin', robots: NOINDEX };

export default function AdminFlagsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Feature flags</h1>
        <p className="text-sm text-muted mt-1">
          A switched-off feature is gone for everyone, paying or not; plans decide who may use a switched-on one. Changes
          reach the site and the worker within 30 seconds.
        </p>
      </div>
      <FlagsTable />
    </div>
  );
}
