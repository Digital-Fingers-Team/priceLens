'use client';
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
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-black mt-2 ${color ?? 'text-ink-50'}`}>{value}</p>
          {sub && <p className="text-xs text-ink-500 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-ink-800 flex items-center justify-center">
          <Icon className="w-5 h-5 text-ink-400" />
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
          <Skeleton key={i} className="h-32 rounded-xl" />
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
        color="text-signal"
        sub={`${formatNumber(stats.listings.accepted)} accepted`}
      />
      <StatCard
        icon={ClipboardList}
        label="Pending Review"
        value={formatNumber(stats.review.pending)}
        color={stats.review.pending > 50 ? 'text-amber-400' : 'text-ink-50'}
      />
      <StatCard icon={Users} label="Users" value={formatNumber(stats.users.total)} />
      <StatCard
        icon={RefreshCw}
        label="Rejected"
        value={formatNumber(stats.listings.rejected)}
        color="text-red-400"
      />
    </div>
  );
}