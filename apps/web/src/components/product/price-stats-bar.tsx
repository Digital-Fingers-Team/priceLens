import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface PriceStatsBarProps {
  min: number | null;
  max: number | null;
  avg: number | null;
  week52Low?: number | null;
  week52High?: number | null;
}

function StatCell({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: 'green' | 'red' | 'neutral';
}) {
  const color =
    highlight === 'green'
      ? 'text-emerald-400'
      : highlight === 'red'
      ? 'text-red-400'
      : 'text-ink-100';

  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3">
      <div className="flex items-center gap-1 text-ink-500 text-xs">
        {icon}
        <span className="uppercase tracking-wider font-medium">{label}</span>
      </div>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

export function PriceStatsBar({
  min,
  max,
  avg,
  week52Low,
  week52High,
}: PriceStatsBarProps) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-ink-700">
        <StatCell
          label="Best Price"
          value={formatCurrency(min)}
          icon={<TrendingDown className="w-3 h-3 text-emerald-400" />}
          highlight="green"
        />
        <StatCell
          label="Highest"
          value={formatCurrency(max)}
          icon={<TrendingUp className="w-3 h-3 text-red-400" />}
          highlight="red"
        />
        <StatCell
          label="Average"
          value={formatCurrency(avg)}
          icon={<Minus className="w-3 h-3" />}
          highlight="neutral"
        />
        <StatCell
          label="52-wk Low"
          value={formatCurrency(week52Low)}
          highlight="green"
        />
        <StatCell
          label="52-wk High"
          value={formatCurrency(week52High)}
          highlight="red"
        />
      </div>
    </div>
  );
}