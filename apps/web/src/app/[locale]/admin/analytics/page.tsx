import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard';

export const metadata: Metadata = { title: 'Analytics', robots: NOINDEX };

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Analytics</h1>
        <p className="text-sm text-muted mt-1">
          Visitors, where they spend time, what they search and save. Days are Cairo days; visitors are anonymous
          browsers, counted since tracking started on 2026-09-29.
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
