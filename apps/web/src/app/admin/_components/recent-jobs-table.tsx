'use client';
import { useDashboardStats } from '@/lib/hooks/use-admin';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  COMPLETED: 'success',
  RUNNING: 'info',
  QUEUED: 'warning',
  FAILED: 'danger',
  CANCELLED: 'default',
};

export function RecentJobsTable() {
  const { data, isLoading } = useDashboardStats();

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-700">
        <h2 className="font-semibold text-ink-100 text-sm">Recent Scraping Jobs</h2>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-ink-800">
          {data?.recentJobs.length === 0 && (
            <p className="text-center text-ink-500 text-sm py-8">No jobs yet</p>
          )}
          {data?.recentJobs.map((job) => (
            <div key={job.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-200 truncate">
                  {job.platform.name} — {job.jobType}
                </p>
                {job.query && (
                  <p className="text-xs text-ink-500 truncate">&quot;{job.query}&quot;</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={STATUS_VARIANT[job.status] ?? 'default'}>
                  {job.status}
                </Badge>
                <span className="text-xs text-ink-600 w-20 text-right">
                  {formatRelativeTime(job.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
