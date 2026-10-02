'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { tradeApi } from '@/lib/api/trade.api';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { intlLocale } from '@/lib/i18n/config';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { productTitle } from '@/lib/product-title';
import type { TradeProduct, TrendEntry } from '@/types/trade.types';

type Section = 'finder' | 'fx' | 'radar';
const FX_CURRENCIES = ['USD', 'EUR', 'CNY', 'GBP', 'SAR', 'AED'];
const FX_DAYS = [30, 90, 365];

/** Importer & trader tools: import finder, FX tracking, trend radar. */
export function ImporterTools() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('finder');
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        label={t.trade.sections}
        controls="importer-panel"
        value={section}
        onValueChange={setSection}
        items={[
          { value: 'finder', label: t.trade.finder.tab },
          { value: 'fx', label: t.trade.fx.tab },
          { value: 'radar', label: t.trade.radar.tab },
        ]}
      />
      <div id="importer-panel" role="tabpanel" className="flex flex-col gap-6">
        {section === 'finder' && <ImportFinder />}
        {section === 'fx' && <FxTracking />}
        {section === 'radar' && <TrendRadarView />}
      </div>
    </div>
  );
}

/** Locked / hidden / loading states shared by the three sections. */
function Gate({ feature, title, body, children }: { feature: string; title: string; body: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const access = useEntitlement(feature);
  if (access === 'loading') return <Skeleton className="h-48 w-full" />;
  if (access === 'hidden') return <EmptyState title={t.trade.unavailable} />;
  if (access === 'locked') return <UpgradePrompt title={title} description={body} />;
  return <>{children}</>;
}

function ProductLink({ product }: { product: TradeProduct | null }) {
  const { locale } = useI18n();
  if (!product) return null;
  return (
    <Link href={`/products/${product.slug}`} className="line-clamp-2 text-fg hover:text-brand">
      {productTitle(product, locale)}
    </Link>
  );
}

function Change({ value }: { value: number | null }) {
  const { fmt } = useI18n();
  if (value == null) return <span className="text-muted">—</span>;
  const tone = value > 0 ? 'text-danger' : value < 0 ? 'text-success' : 'text-muted';
  return (
    <span className={`tabular-nums ${tone}`} dir="ltr">
      {value > 0 ? '+' : ''}
      {fmt.number(value)}%
    </span>
  );
}

// ── Import finder ──────────────────────────────────────────────────────

function ImportFinder() {
  const { t } = useI18n();
  return (
    <Gate feature="import_finder" title={t.trade.finder.lockedTitle} body={t.trade.finder.lockedBody}>
      <ImportFinderBody />
    </Gate>
  );
}

function ImportFinderBody() {
  const { t, tf, fmt } = useI18n();
  const [categoryId, setCategoryId] = useState('');
  const [minMargin, setMinMargin] = useState('20');
  const { data, isLoading } = useQuery({
    queryKey: ['trade', 'opportunities', categoryId, minMargin],
    queryFn: () => tradeApi.opportunities({ categoryId: categoryId || undefined, minMarginPct: Number(minMargin), limit: 100 }),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.trade.finder.title}</h2>
        <p className="text-sm text-muted">{t.trade.finder.lede}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t.trade.finder.category}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            placeholder={t.trade.finder.allCategories}
            options={(data?.categories ?? []).map((category) => ({ value: category.id, label: `${category.name} (${category.count})` }))}
          />
          <Select
            label={t.trade.finder.minMargin}
            value={minMargin}
            onChange={(event) => setMinMargin(event.target.value)}
            options={['10', '20', '30', '40'].map((value) => ({ value, label: `${value}%+` }))}
          />
        </div>
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : data.items.length === 0 ? (
          <EmptyState title={t.trade.finder.emptyTitle} description={t.trade.finder.emptyBody} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <Th>{t.trade.product}</Th>
                  <Th align="end">{t.trade.finder.landed}</Th>
                  <Th align="end">{t.trade.finder.local}</Th>
                  <Th align="end">{t.trade.finder.margin}</Th>
                  <Th align="end">{t.trade.finder.demand}</Th>
                </tr>
              </THead>
              <TBody>
                {data.items.map((item) => (
                  <tr key={item.product.id}>
                    <Td>
                      <ProductLink product={item.product} />
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {item.category.name} · {item.importStore.name} {fmt.currency(item.importPrice, data.currency)}
                        {item.checkMatch && <Badge variant="warning">{t.trade.finder.checkMatch}</Badge>}
                      </span>
                    </Td>
                    <Td align="end">{fmt.currency(item.landedCost, data.currency)}</Td>
                    <Td align="end">
                      {fmt.currency(item.localMedian, data.currency)}
                      <span className="block text-xs text-muted">{tf(t.trade.finder.stores, { n: item.localStores })}</span>
                    </Td>
                    <Td align="end" className="text-success">
                      {fmt.currency(item.marginEgp, data.currency)}
                      <span className="block text-xs">{fmt.number(item.marginPct)}%</span>
                    </Td>
                    <Td align="end">
                      <DemandMeter value={item.demandScore} />
                      {item.volatilityPct != null && (
                        <span className="block text-xs text-muted">{tf(t.trade.finder.volatility, { pct: fmt.number(item.volatilityPct) })}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            <p className="flex items-start gap-2 text-xs text-muted">
              <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t.trade.finder.explained}
                {data.computedAt && <> {tf(t.trade.updated, { date: fmt.date(data.computedAt) })}</>}
              </span>
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function DemandMeter({ value }: { value: number }) {
  const { t } = useI18n();
  const label = value >= 0.6 ? t.trade.finder.demandHigh : value >= 0.3 ? t.trade.finder.demandMedium : t.trade.finder.demandLow;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="text-sm text-fg">{label}</span>
      <span className="h-2 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
    </span>
  );
}

// ── FX ─────────────────────────────────────────────────────────────────

function FxTracking() {
  const { t } = useI18n();
  return (
    <>
      <FxToday />
      <Gate feature="fx_tracking" title={t.trade.fx.lockedTitle} body={t.trade.fx.lockedBody}>
        <FxHistoryCard />
        <FxImpactCard />
      </Gate>
    </>
  );
}

/** Today's rates: public. */
function FxToday() {
  const { t, fmt } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ['trade', 'fx', 'rates'], queryFn: () => tradeApi.fxRates(), staleTime: 10 * 60 * 1000 });
  const usd = data?.rates.filter((rate) => rate.currency === 'USD') ?? [];
  const others = data?.rates.filter((rate) => rate.currency !== 'USD' && rate.source === 'CBE') ?? [];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.trade.fx.todayTitle}</h2>
        <p className="text-sm text-muted">{t.trade.fx.todayLede}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.rates.length === 0 ? (
          <EmptyState title={t.trade.fx.noRates} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {usd.map((rate) => (
                <div key={rate.source} className="rounded border border-border p-4">
                  <p className="text-xs text-muted">{rate.source === 'CBE' ? t.trade.fx.cbe : t.trade.fx.market}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-fg" dir="ltr">
                    {fmt.number(rate.sell ?? rate.mid)} <span className="text-sm font-normal text-muted">EGP / USD</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    {rate.buy != null && (
                      <span>
                        {t.trade.fx.buy} {fmt.number(rate.buy)} · {t.trade.fx.sell} {fmt.number(rate.sell)}
                      </span>
                    )}
                    <span>{fmt.date(rate.rateDate)}</span>
                    <Change value={rate.changePct} />
                  </p>
                </div>
              ))}
            </div>
            {others.length > 0 && (
              <Table>
                <THead>
                  <tr>
                    <Th>{t.trade.fx.currency}</Th>
                    <Th align="end">{t.trade.fx.buy}</Th>
                    <Th align="end">{t.trade.fx.sell}</Th>
                    <Th align="end">{t.trade.fx.change}</Th>
                  </tr>
                </THead>
                <TBody>
                  {others.map((rate) => (
                    <tr key={rate.currency}>
                      <Td>{rate.currency}</Td>
                      <Td align="end">{fmt.number(rate.buy)}</Td>
                      <Td align="end">{fmt.number(rate.sell)}</Td>
                      <Td align="end">
                        <Change value={rate.changePct} />
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

const CHART_TOKENS = ['brand', 'muted', 'border', 'info'] as const;

function FxHistoryCard() {
  const { t, tf, fmt, locale } = useI18n();
  const [currency, setCurrency] = useState('USD');
  const [days, setDays] = useState(90);
  const colors = useThemeColors(CHART_TOKENS);
  const { data, isLoading } = useQuery({
    queryKey: ['trade', 'fx', 'history', currency, days],
    queryFn: () => tradeApi.fxHistory(currency, days),
  });
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { month: 'numeric', day: 'numeric' });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">{t.trade.fx.historyTitle}</h2>
          <p className="text-sm text-muted">{t.trade.fx.historyLede}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t.trade.fx.currency}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            options={FX_CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
          <Tabs
            label={t.trade.fx.range}
            value={String(days)}
            onValueChange={(value) => setDays(Number(value))}
            items={FX_DAYS.map((d) => ({ value: String(d), label: tf(t.trade.fx.nDays, { n: d }) }))}
          />
        </div>
      </CardHeader>
      <CardBody>
        {isLoading || !data || !colors ? (
          <Skeleton className="h-64 w-full" />
        ) : data.points.length < 2 ? (
          <EmptyState title={t.trade.fx.historyEmptyTitle} description={t.trade.fx.historyEmptyBody} />
        ) : (
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => dayLabel.format(new Date(v))}
                  tick={{ fontSize: 12, fill: colors.muted }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12, fill: colors.muted }} axisLine={false} tickLine={false} width={48} domain={['auto', 'auto']} />
                <Tooltip
                  labelFormatter={(label) => fmt.date(String(label))}
                  formatter={(value) => (typeof value === 'number' ? fmt.number(value) : '—')}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line type="monotone" dataKey="cbe" name={t.trade.fx.cbe} stroke={colors.brand} strokeWidth={2} dot={false} connectNulls />
                <Line
                  type="monotone"
                  dataKey="market"
                  name={t.trade.fx.market}
                  stroke={colors.info}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FxImpactCard() {
  const { t, tf, fmt } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ['trade', 'fx', 'impact'], queryFn: () => tradeApi.fxImpact() });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.trade.fx.impactTitle}</h2>
        <p className="text-sm text-muted">{t.trade.fx.impactLede}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {isLoading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : data.items.length === 0 ? (
          <EmptyState title={t.trade.fx.impactEmptyTitle} description={data.tracked === 0 ? t.trade.fx.impactEmptyNone : t.trade.fx.impactEmptyLocal} />
        ) : (
          <>
            {data.usd && (
              <p className="text-sm text-muted">
                {tf(t.trade.fx.atRate, { rate: fmt.number(data.usd.rate) })}
                {data.rateMonthAgo != null && <> · {tf(t.trade.fx.monthAgo, { rate: fmt.number(data.rateMonthAgo) })}</>}
              </p>
            )}
            <Table>
              <THead>
                <tr>
                  <Th>{t.trade.product}</Th>
                  <Th align="end">{t.trade.fx.landedNow}</Th>
                  {data.steps.map((step) => (
                    <Th key={step} align="end">
                      <span dir="ltr">
                        {step > 0 ? '+' : ''}
                        {step}%
                      </span>
                    </Th>
                  ))}
                  <Th align="end">{t.trade.fx.breakEven}</Th>
                </tr>
              </THead>
              <TBody>
                {data.items.map((item) => (
                  <tr key={item.product.id}>
                    <Td>
                      <ProductLink product={item.product} />
                      <span className="mt-1 block text-xs text-muted">
                        {item.importStore}
                        {item.localLowest != null && item.localStore && (
                          <> · {tf(t.trade.fx.localAt, { store: item.localStore, price: fmt.currency(item.localLowest) })}</>
                        )}
                      </span>
                    </Td>
                    <Td align="end">
                      {fmt.currency(item.landedCost)}
                      {item.landedMonthAgo != null && (
                        <span className="block text-xs text-muted">{tf(t.trade.fx.wasMonthAgo, { price: fmt.currency(item.landedMonthAgo) })}</span>
                      )}
                    </Td>
                    {item.scenarios.map((scenario) => (
                      <Td key={scenario.changePct} align="end">
                        {fmt.currency(scenario.landedCost)}
                        {scenario.marginPct != null && (
                          <span className={`block text-xs ${scenario.marginPct < 0 ? 'text-danger' : 'text-muted'}`}>
                            {fmt.number(scenario.marginPct)}%
                          </span>
                        )}
                      </Td>
                    ))}
                    <Td align="end">{item.breakEvenRate != null ? fmt.number(item.breakEvenRate) : '—'}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            <p className="flex items-start gap-2 text-xs text-muted">
              <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              {t.trade.fx.impactExplained}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ── Trend radar ────────────────────────────────────────────────────────

function TrendRadarView() {
  const { t } = useI18n();
  return (
    <Gate feature="trend_radar" title={t.trade.radar.lockedTitle} body={t.trade.radar.lockedBody}>
      <TrendRadarBody />
    </Gate>
  );
}

function Growth({ now, before }: { now: number; before: number }) {
  const { fmt } = useI18n();
  const up = now > before;
  const down = now < before;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {fmt.number(now)}
      {up && <TrendingUp className="h-4 w-4 text-success" aria-hidden />}
      {down && <TrendingDown className="h-4 w-4 text-muted" aria-hidden />}
      <span className="text-xs text-muted">({fmt.number(before)})</span>
    </span>
  );
}

function TrendRadarBody() {
  const { t, tf, fmt } = useI18n();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, isLoading } = useQuery({ queryKey: ['trade', 'radar', week ?? 'latest'], queryFn: () => tradeApi.trendRadar(week) });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  if (!data.weekStart) return <EmptyState title={t.trade.radar.emptyTitle} description={t.trade.radar.emptyBody} />;

  const row = (entry: TrendEntry) => (
    <>
      <Td align="end">
        <Growth now={entry.supply} before={entry.supplyBefore} />
      </Td>
      <Td align="end">
        <Growth now={entry.interest} before={entry.interestBefore} />
      </Td>
      <Td align="end">
        <Change value={entry.priceChangePct} />
      </Td>
    </>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">{t.trade.radar.categoriesTitle}</h2>
            <p className="text-sm text-muted">{tf(t.trade.radar.week, { from: fmt.date(data.weekStart), to: fmt.date(data.weekEnd ?? data.weekStart) })}</p>
          </div>
          {data.weeks.length > 1 && (
            <Select
              label={t.trade.radar.pickWeek}
              value={data.weekStart}
              onChange={(event) => setWeek(event.target.value)}
              options={data.weeks.map((w) => ({ value: w, label: fmt.date(w) }))}
            />
          )}
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Table>
            <THead>
              <tr>
                <Th>{t.trade.radar.category}</Th>
                <Th align="end">{t.trade.radar.newListings}</Th>
                <Th align="end">{t.trade.radar.interest}</Th>
                <Th align="end">{t.trade.radar.priceMove}</Th>
              </tr>
            </THead>
            <TBody>
              {data.categories.map((entry) => (
                <tr key={entry.category?.id}>
                  <Td>
                    {entry.category && (
                      <Link href={`/categories/${entry.category.slug}`} className="text-fg hover:text-brand">
                        {entry.category.name}
                      </Link>
                    )}
                    {entry.metrics.priced ? (
                      <span className="block text-xs text-muted">
                        {tf(t.trade.radar.dropsRises, { drops: entry.metrics.drops ?? 0, rises: entry.metrics.rises ?? 0 })}
                      </span>
                    ) : null}
                  </Td>
                  {row(entry)}
                </tr>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{t.trade.radar.productsTitle}</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {data.products.length === 0 ? (
            <EmptyState title={t.trade.radar.noProducts} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{t.trade.product}</Th>
                  <Th align="end">{t.trade.radar.stores}</Th>
                  <Th align="end">{t.trade.radar.interest}</Th>
                  <Th align="end">{t.trade.radar.priceMove}</Th>
                </tr>
              </THead>
              <TBody>
                {data.products.map((entry) => (
                  <tr key={entry.product?.id}>
                    <Td>
                      <ProductLink product={entry.product} />
                      {entry.category && <span className="block text-xs text-muted">{entry.category.name}</span>}
                    </Td>
                    {row(entry)}
                  </tr>
                ))}
              </TBody>
            </Table>
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden />
            {t.trade.radar.explained}
          </p>
        </CardBody>
      </Card>
    </>
  );
}
