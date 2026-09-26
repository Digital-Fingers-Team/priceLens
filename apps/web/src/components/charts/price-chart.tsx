'use client';
import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { PRICE_HISTORY_DAYS } from '@/config/constants';
import { usePriceHistory } from '@/lib/hooks/use-price-history';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { intlLocale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { PriceChartSkeleton } from './price-chart-skeleton';

const TOKENS = ['brand', 'muted', 'border', 'info'] as const;

type TooltipPayloadEntry = {
  dataKey?: string;
  name?: string;
  color?: string;
  value?: number | string | null;
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  const { fmt } = useI18n();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-sm shadow">
      <p className="mb-1 text-xs text-muted">{fmt.date(label)}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <span className="text-muted">{entry.name}</span>
          <span className="font-medium tabular-nums text-fg">
            {fmt.currency(typeof entry.value === 'number' ? entry.value : null)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Best and highest recorded price per day. The section around it carries the
 * "Price history" heading (UI-14). The time axis runs left to right in both
 * languages, as charts do on Arabic finance sites.
 */
export function PriceChart({ productId }: { productId: string }) {
  const { t, tf, tp, fmt, locale } = useI18n();
  const [days, setDays] = useState<number>(90);
  const { data, isLoading, isError } = usePriceHistory(productId, { days });
  const colors = useThemeColors(TOKENS);

  if (isLoading || !colors) return <PriceChartSkeleton />;

  if (isError || !data) {
    return <ErrorState title={t.chart.unavailable} className="rounded border border-border bg-surface" />;
  }

  const chartData = data.chart.filter((p) => p.min != null);
  const avgValue = data.summary.avgPrice;
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { month: 'numeric', day: 'numeric' });
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-4 rounded border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {tf(t.chart.summary, { points: tp(t.chart.points, data.summary.dataPoints), days: tp(t.chart.days, days) })}
        </p>
        <Tabs
          label={t.chart.range}
          controls={`chart-${productId}`}
          value={String(days)}
          onValueChange={(v) => setDays(Number(v))}
          items={PRICE_HISTORY_DAYS.map((d) => ({ value: String(d), label: d === 365 ? t.chart.oneYear : tf(t.chart.nDays, { n: d }) }))}
        />
      </div>

      <div id={`chart-${productId}`} role="tabpanel" dir="ltr" className="h-72">
        {chartData.length === 0 ? (
          <EmptyState title={t.chart.emptyTitle} description={t.chart.emptyBody} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => dayLabel.format(new Date(v))}
                tick={{ fontSize: 12, fill: colors.muted }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => compact.format(v)}
                tick={{ fontSize: 12, fill: colors.muted }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<ChartTooltip />} />
              {avgValue != null && (
                <ReferenceLine
                  y={avgValue}
                  stroke={colors.info}
                  strokeDasharray="4 4"
                  label={{
                    value: tf(t.chart.average, { price: fmt.currency(avgValue) }),
                    position: 'insideTopRight',
                    fontSize: 12,
                    fill: colors.info,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="max"
                name={t.chart.highest}
                stroke={colors.muted}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: colors.muted }}
              />
              <Area
                type="monotone"
                dataKey="min"
                name={t.chart.best}
                stroke={colors.brand}
                strokeWidth={2}
                fill={colors.brand}
                fillOpacity={0.08}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: colors.brand }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {data.platformBreakdown.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="label-mono text-muted">{t.chart.byStore}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {data.platformBreakdown.map((p) => (
              <div key={p.platformId} className="flex items-center gap-2">
                <dt className="font-medium text-fg">{p.name}</dt>
                <dd className="tabular-nums text-muted">
                  <span className="text-brand">{fmt.currency(p.minPrice)}</span> – {fmt.currency(p.maxPrice)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
