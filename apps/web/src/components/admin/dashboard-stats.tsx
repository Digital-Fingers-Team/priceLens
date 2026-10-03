'use client';
import type { LucideIcon } from 'lucide-react';
import { Package, Store, ClipboardList, Users, TrendingUp, RefreshCw } from 'lucide-react';
import { useDashboardStats } from '@/lib/hooks/use-admin';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/utils/format';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-mono text-muted">{label}</p>
          <p className={`text-2xl font-semibold mt-2 ${color ?? 'text-fg'}`}>{value}</p>
          {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded bg-surface-2 flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted" />
        </div>
      </div>
    </div>
  );
}

export function DashboardStats() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard icon={Package} label="Products" value={formatNumber(stats.products.total)} />
      <StatCard icon={Store} label="Listings" value={formatNumber(stats.listings.total)} />
      <StatCard
        icon={TrendingUp}
        label="Match Rate"
        value={stats.matchRate}
        color="text-brand-text"
        sub={`${formatNumber(stats.listings.accepted)} accepted`}
      />
      <StatCard
        icon={ClipboardList}
        label="Pending Review"
        value={formatNumber(stats.review.pending)}
        color={stats.review.pending > 50 ? 'text-warning' : 'text-fg'}
      />
      <StatCard icon={Users} label="Users" value={formatNumber(stats.users.total)} />
      <StatCard
        icon={RefreshCw}
        label="Rejected"
        value={formatNumber(stats.listings.rejected)}
        color="text-danger"
      />
    </div>
  );
}
