import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { DashboardStats } from '@/components/admin/dashboard-stats';
import { RecentJobsTable } from './_components/recent-jobs-table';
import { QuickActions } from './_components/quick-actions';

export const metadata: Metadata = { title: 'Admin Dashboard', robots: NOINDEX };

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Dashboard</h1>
        <p className="text-sm text-muted mt-1">System health and matching pipeline overview</p>
      </div>

      <DashboardStats />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentJobsTable />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}