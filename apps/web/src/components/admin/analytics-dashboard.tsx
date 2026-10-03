'use client';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Clock, Eye, Heart, MousePointerClick, PackagePlus, Search, UserPlus, Users } from 'lucide-react';
import { useAnalyticsSummary } from '@/lib/hooks/use-admin';
import { Link } from '@/lib/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';
import type { AnalyticsDays, AnalyticsSummary } from '@/types/analytics.types';

const RANGES: Array<{ days: AnalyticsDays; label: string }> = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const ROUTE_LABELS: Record<string, string> = {
  home: 'Home page',
  product: 'Product pages',
  category: 'Category pages',
  search: 'Search',
  account: 'Account & watchlist',
  other: 'Other pages',
};

/** "45s", "3m 20s", "2h 5m". */
function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Tile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-mono text-muted">{label}</p>
          <p className="text-2xl font-semibold mt-2 text-fg tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 shrink-0 rounded bg-surface-2 flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded border border-border bg-surface p-5 min-w-0', className)}>
      <h2 className="text-sm font-semibold text-fg mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted py-6 text-center">{children}</p>;
}

/**
 * One series per day as bars, zero-filled so quiet days show as gaps. The
 * value of each day is in its hover label (and the screen-reader label).
 */
function DailyBars({
  since,
  days,
  points,
  unit,
}: {
  since: string;
  days: number;
  points: Array<{ day: string; value: number }>;
  unit: string;
}) {
  const byDay = new Map(points.map((p) => [p.day, p.value]));
  const start = new Date(`${cairoDay(since)}T00:00:00Z`);
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { day, value: byDay.get(day) ?? 0 };
  });
  const max = Math.max(1, ...series.map((p) => p.value));
  const total = series.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return <Empty>Nothing yet in this range.</Empty>;

  return (
    <div>
      <div className="flex items-end h-32 gap-px border-b border-border" role="img" aria-label={`${unit} per day`}>
        {series.map((p) => (
          <div key={p.day} className="group relative flex-1 h-full flex items-end">
            <div
              className="w-full rounded-t bg-brand transition-opacity group-hover:opacity-80"
              style={{ height: p.value ? `${Math.max(2, (p.value / max) * 100)}%` : 0 }}
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-full mb-1 hidden group-hover:flex justify-center z-10">
              <span className="whitespace-nowrap rounded bg-fg px-2 py-1 text-xs text-surface">
                {p.day}: {formatNumber(p.value)} {unit}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted mt-1 tabular-nums">
        <span>{series[0].day}</span>
        <span>
          max {formatNumber(max)} / day
        </span>
        <span>{series[series.length - 1].day}</span>
      </div>
    </div>
  );
}

/** The Cairo calendar day of a UTC instant (the API's range starts at Cairo midnight). */
function cairoDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(iso));
}

/** A ranked list with a proportional bar behind each row's value. */
function RankList({
  rows,
  empty,
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; display: string; sub?: string }>;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 truncate text-fg">{r.label}</div>
            <div className="shrink-0 tabular-nums text-fg font-medium">{r.display}</div>
          </div>
          <div className="mt-1 h-1 rounded-full bg-surface-2">
            <div className="h-1 rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <p className="text-xs text-muted mt-1 truncate">{r.sub}</p>}
        </li>
      ))}
    </ol>
  );
}

function ProductLabel({ slug, title, titleAr }: { slug: string; title: string; titleAr: string | null }) {
  return (
    <Link href={`/products/${slug}`} className="hover:underline" title={titleAr ?? title}>
      {title}
    </Link>
  );
}

function Dashboard({ data }: { data: AnalyticsSummary }) {
  const { traffic, engagement, searches, products, accounts, favorites, storeClicks } = data;
  const mobile = traffic.devices.find((d) => d.device === 'mobile')?.visitors ?? 0;
  const deviceTotal = traffic.devices.reduce((sum, d) => sum + d.visitors, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          icon={Users}
          label="Visitors"
          value={formatNumber(traffic.visitors)}
          sub={`${formatNumber(traffic.sessions)} visits · ${deviceTotal ? Math.round((mobile / deviceTotal) * 100) : 0}% on phones`}
        />
        <Tile icon={Eye} label="Page views" value={formatNumber(traffic.views)} sub={`avg ${duration(traffic.avgViewMs)} per page`} />
        <Tile
          icon={PackagePlus}
          label="Products discovered"
          value={formatNumber(products.discovered)}
          sub={`${formatNumber(products.total)} in the catalogue`}
        />
        <Tile
          icon={UserPlus}
          label="Accounts"
          value={formatNumber(accounts.total)}
          sub={`${formatNumber(accounts.new)} new · ${formatNumber(accounts.active)} signed in`}
        />
        <Tile
          icon={Heart}
          label="Watchlist saves"
          value={formatNumber(favorites.total)}
          sub={`${formatNumber(favorites.alerts)} price alerts`}
        />
        <Tile
          icon={Search}
          label="Searches"
          value={formatNumber(traffic.searches)}
          sub={`${formatNumber(searches.noResults.reduce((sum, s) => sum + s.searches, 0))} found nothing`}
        />
        <Tile icon={MousePointerClick} label="Clicks to stores" value={formatNumber(storeClicks.total)} />
        <Tile
          icon={Clock}
          label="Time on site"
          value={duration(engagement.routes.reduce((sum, r) => sum + r.totalMs, 0))}
          sub="visible time, all pages"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Visitors per day">
          <DailyBars
            since={data.since}
            days={data.days}
            unit="visitors"
            points={traffic.daily.map((d) => ({ day: d.day, value: d.visitors }))}
          />
        </Panel>
        <Panel title="Products discovered per day">
          <DailyBars
            since={data.since}
            days={data.days}
            unit="new products"
            points={products.daily.map((d) => ({ day: d.day, value: d.count }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Where people spend their time">
          <RankList
            empty="No page views yet."
            rows={engagement.routes.map((r) => ({
              key: r.route,
              label: ROUTE_LABELS[r.route] ?? r.route,
              value: r.totalMs,
              display: duration(r.totalMs),
              sub: `${formatNumber(r.views)} views · avg ${duration(r.avgViewMs)}`,
            }))}
          />
        </Panel>
        <Panel title="Products people stayed on longest" className="xl:col-span-2">
          <RankList
            empty="No product page views yet."
            rows={engagement.products.map((p) => ({
              key: p.slug,
              label: <ProductLabel {...p} />,
              value: p.totalMs,
              display: duration(p.totalMs),
              sub: `${formatNumber(p.views)} views by ${formatNumber(p.visitors)} visitors · avg ${duration(p.avgViewMs)}`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="What people search" className="xl:col-span-2">
          {searches.top.length === 0 ? (
            <Empty>No searches yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-muted">
                    <th className="font-medium pb-2">Query</th>
                    <th className="font-medium pb-2 text-end">Searches</th>
                    <th className="font-medium pb-2 text-end">People</th>
                    <th className="font-medium pb-2 text-end">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.top.map((s) => (
                    <tr key={s.query} className="border-t border-border">
                      <td className="py-2 pe-3 text-fg" dir="auto">
                        {s.query}
                      </td>
                      <td className="py-2 text-end tabular-nums">{formatNumber(s.searches)}</td>
                      <td className="py-2 text-end tabular-nums">{formatNumber(s.visitors)}</td>
                      <td className="py-2 text-end tabular-nums">
                        {s.avgResults == null ? '–' : formatNumber(s.avgResults)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Searches with no results">
          <RankList
            empty="None — every search found something."
            rows={searches.noResults.map((s) => ({
              key: s.query,
              label: <span dir="auto">{s.query}</span>,
              value: s.searches,
              display: formatNumber(s.searches),
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Most saved to watchlists">
          <RankList
            empty="Nobody has saved a product yet."
            rows={favorites.products.map((p) => ({
              key: p.slug,
              label: <ProductLabel {...p} />,
              value: p.count,
              display: formatNumber(p.count),
              sub: p.new ? `${formatNumber(p.new)} in this range` : undefined,
            }))}
          />
        </Panel>
        <Panel title="Most price alerts">
          <RankList
            empty="No price alerts yet."
            rows={favorites.alertProducts.map((p) => ({
              key: p.slug,
              label: <ProductLabel {...p} />,
              value: p.count,
              display: formatNumber(p.count),
            }))}
          />
        </Panel>
        <Panel title="Clicks to stores">
          <RankList
            empty="No store clicks in this range."
            rows={storeClicks.stores.map((s) => ({
              key: s.store,
              label: s.store,
              value: s.clicks,
              display: formatNumber(s.clicks),
            }))}
          />
        </Panel>
        <Panel title="Most clicked products">
          <RankList
            empty="No store clicks in this range."
            rows={(storeClicks.products ?? []).map((p) => ({
              key: p.slug,
              label: <ProductLabel {...p} />,
              value: p.count,
              display: formatNumber(p.count),
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Most viewed categories">
          <RankList
            empty="No category page views yet."
            rows={engagement.categories.map((c) => ({
              key: c.slug,
              label: c.name,
              value: c.views,
              display: formatNumber(c.views),
              sub: `${duration(c.totalMs)} in total`,
            }))}
          />
        </Panel>
        <Panel title="Where visitors come from">
          <RankList
            empty="No outside referrers yet."
            rows={traffic.referrers.map((r) => ({
              key: r.host,
              label: r.host,
              value: r.sessions,
              display: formatNumber(r.sessions),
            }))}
          />
        </Panel>
        <Panel title="New accounts per day">
          <DailyBars
            since={data.since}
            days={data.days}
            unit="accounts"
            points={accounts.daily.map((d) => ({ day: d.day, value: d.count }))}
          />
        </Panel>
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const { data, isLoading, isError } = useAnalyticsSummary(days);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            className={cn(
              'px-3 py-2 rounded text-sm font-medium border transition-colors',
              days === r.days
                ? 'bg-brand-soft text-brand-text border-brand/20'
                : 'border-border text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded" />
          ))}
        </div>
      ) : isError || !data ? (
        <Empty>Could not load analytics.</Empty>
      ) : (
        <Dashboard data={data} />
      )}
    </div>
  );
}
