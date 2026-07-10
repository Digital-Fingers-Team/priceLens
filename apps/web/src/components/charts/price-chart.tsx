'use client';
import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { usePriceHistory } from '@/lib/hooks/use-price-history';
import { PriceChartSkeleton } from './price-chart-skeleton';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { PRICE_HISTORY_DAYS } from '@/config/constants';
import { cn } from '@/lib/utils/cn';

interface PriceChartProps {
  productId: string;
}

const CHART_COLORS = {
  min: '#00FF88',
  max: '#FF3B5C',
  avg: '#3B82F6',
};

type TooltipPayloadEntry = {
  dataKey?: string;
  name?: string;
  color?: string;
  value?: number | string | null;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 shadow-2xl px-4 py-3 text-sm">
      <p className="text-ink-400 mb-2 text-xs">{formatDate(label)}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <span className="text-ink-400 capitalize">{entry.name}</span>
          <span className="font-semibold" style={{ color: entry.color }}>
            {formatCurrency(typeof entry.value === 'number' ? entry.value : null)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PriceChart({ productId }: PriceChartProps) {
  const [days, setDays] = useState<number>(90);
  const { data, isLoading, isError } = usePriceHistory(productId, { days });

  if (isLoading) return <PriceChartSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-ink-700 bg-ink-900">
        <p className="text-ink-500 text-sm">Price history unavailable</p>
      </div>
    );
  }

  // Filter to only points that have data
  const chartData = data.chart.filter((p) => p.min != null);

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-ink-700 bg-ink-900">
        <p className="text-ink-400 text-sm font-medium">No price history yet</p>
        <p className="text-ink-600 text-xs mt-1">Prices will appear as listings are tracked</p>
      </div>
    );
  }

  const avgValue = data.summary.avgPrice;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-ink-100">Price History</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {data.summary.dataPoints} data points across {days} days
          </p>
        </div>

        {/* Day selector */}
        <div className="flex items-center gap-1 bg-ink-800 rounded-lg p-1">
          {PRICE_HISTORY_DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                days === d
                  ? 'bg-signal text-ink-950'
                  : 'text-ink-400 hover:text-ink-200',
              )}
            >
              {d === 365 ? '1Y' : `${d}D`}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradMin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.min} stopOpacity={0.15} />
              <stop offset="95%" stopColor={CHART_COLORS.min} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.max} stopOpacity={0.08} />
              <stop offset="95%" stopColor={CHART_COLORS.max} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A30" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            tick={{ fontSize: 11, fill: '#606080' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
            tick={{ fontSize: 11, fill: '#606080' }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={['auto', 'auto']}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Average reference line */}
          {avgValue != null && (
            <ReferenceLine
              y={avgValue}
              stroke={CHART_COLORS.avg}
              strokeDasharray="4 3"
              strokeOpacity={0.5}
              label={{
                value: `Avg ${formatCurrency(avgValue)}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: CHART_COLORS.avg,
                opacity: 0.7,
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="max"
            name="Highest"
            stroke={CHART_COLORS.max}
            strokeWidth={1.5}
            strokeOpacity={0.6}
            fill="url(#gradMax)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />

          <Area
            type="monotone"
            dataKey="min"
            name="Best Price"
            stroke={CHART_COLORS.min}
            strokeWidth={2}
            fill="url(#gradMin)"
            dot={false}
            activeDot={{ r: 5, fill: CHART_COLORS.min, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Platform breakdown */}
      {data.platformBreakdown.length > 1 && (
        <div className="pt-3 border-t border-ink-800">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
            By Platform
          </p>
          <div className="flex flex-wrap gap-3">
            {data.platformBreakdown.map((p) => (
              <div key={p.platformId} className="flex items-center gap-2 text-xs">
                <span className="text-ink-400 font-medium">{p.name}</span>
                <span className="text-signal">{formatCurrency(p.minPrice)}</span>
                <span className="text-ink-600">—</span>
                <span className="text-ink-400">{formatCurrency(p.maxPrice)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
