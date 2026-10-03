'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Download, Info, Plus, Trash2 } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { apiClient } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import type { ApiResponse } from '@/types/api.types';

interface Breakdown {
  price: number;
  commission: number;
  fixedFee: number;
  shipping: number;
  returns: number;
  vat: number;
  netProfit: number | null;
  marginPct: number | null;
}
interface ProfitRow {
  platform: { id: string; name: string };
  feesUpdatedAt: string;
  breakdown: Breakdown | null;
  breakEven: number | null;
}
interface BestRow {
  platform: { id: string; name: string };
  marketPrice: number | null;
  priceUsed: number | null;
  priceSource: 'MARKET' | 'YOURS' | null;
  netProfit: number | null;
  marginPct: number | null;
}
type Strategy = 'BEAT_LOWEST' | 'MATCH_LOWEST';
interface RepricerState {
  strategy: Strategy | null;
  offset: number;
  floor: number | null;
  ceiling: number | null;
  currentPrice: number | null;
  suggestedPrice: number | null;
  suggestionReason: string | null;
  suggestedAt: string | null;
  log: Array<{ id: string; oldPrice: number | null; newPrice: number | null; source: string; reason: string; createdAt: string }>;
}
interface RankRow {
  id: string;
  keyword: string;
  platform: { id: string; name: string };
  latest: { position: number | null; scanned: number; checkedAt: string } | null;
  history: Array<{ position: number | null; checkedAt: string }>;
}
interface Timeline {
  stores: Array<{ platformId: string; platformName: string; points: Array<{ day: string; price: number }> }>;
  events: Array<{ id: string; type: string; platformName: string; previousPrice: number | null; newPrice: number | null; detectedAt: string }>;
}

const get = async <T,>(url: string, params?: Record<string, unknown>) => (await apiClient.get<ApiResponse<T>>(url, { params })).data.data;

/** One feature-gated card: nothing when switched off, an upgrade note when the plan lacks it. */
function Gated({ feature, title, children }: { feature: string; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const access = useEntitlement(feature);
  if (access === 'hidden') return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {access === 'loading' ? (
          <Skeleton className="h-24 w-full" />
        ) : access === 'locked' ? (
          <UpgradePrompt compact title={title} description={t.sellerTools.locked} />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}

export function SellerTools({ orgId, productId, currency, hasCost }: { orgId: string; productId: string; currency: string; hasCost: boolean }) {
  const { t } = useI18n();
  const base = `/seller/workspaces/${orgId}/products/${productId}`;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Gated feature="profit_calculator" title={t.sellerTools.profitTitle}>
        <Profit base={base} currency={currency} hasCost={hasCost} />
      </Gated>
      <Gated feature="best_platform" title={t.sellerTools.bestTitle}>
        <BestPlatform base={base} currency={currency} />
      </Gated>
      <Gated feature="repricer_suggest" title={t.sellerTools.repricerTitle}>
        <Repricer base={base} currency={currency} />
      </Gated>
      <Gated feature="rank_tracking" title={t.sellerTools.ranksTitle}>
        <Ranks base={base} orgId={orgId} />
      </Gated>
      <div className="lg:col-span-2">
        <Gated feature="competitor_monitoring" title={t.sellerTools.timelineTitle}>
          <CompetitorTimeline base={base} currency={currency} />
        </Gated>
      </div>
    </div>
  );
}

function FeesNote({ updatedAt }: { updatedAt: string | undefined }) {
  const { t, tf, fmt } = useI18n();
  if (!updatedAt) return null;
  return <p className="text-xs text-muted">{tf(t.sellerTools.feesUpdated, { date: fmt.date(updatedAt) })}</p>;
}

function Profit({ base, currency, hasCost }: { base: string; currency: string; hasCost: boolean }) {
  const { t, fmt } = useI18n();
  const [price, setPrice] = useState('');
  const tested = Number(price) > 0 ? Number(price) : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['seller-tools', base, 'profit', tested ?? null],
    queryFn: () => get<{ price: number | null; rows: ProfitRow[] }>(`${base}/profit`, tested ? { price: tested } : undefined),
  });
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  if (data.rows.length === 0) return <p className="text-sm text-muted">{t.sellerTools.noFees}</p>;
  return (
    <>
      <Input
        label={t.sellerTools.testPrice}
        type="number"
        inputMode="decimal"
        dir="ltr"
        min="0"
        value={price}
        placeholder={data.price?.toString() ?? ''}
        onChange={(event) => setPrice(event.target.value)}
      />
      {!hasCost && <p className="text-xs text-warning">{t.sellerTools.needCost}</p>}
      <Table>
        <THead>
          <tr>
            <Th>{t.seller.store}</Th>
            <Th align="end">{t.sellerTools.fees}</Th>
            <Th align="end">{t.sellerTools.net}</Th>
            <Th align="end">{t.sellerTools.breakEven}</Th>
          </tr>
        </THead>
        <TBody>
          {data.rows.map((row) => {
            const b = row.breakdown;
            const fees = b ? b.commission + b.fixedFee + b.shipping + b.returns + b.vat : null;
            return (
              <tr key={row.platform.id}>
                <Td>{row.platform.name}</Td>
                <Td align="end">{fmt.currency(fees, currency)}</Td>
                <Td align="end" className={b?.netProfit != null && b.netProfit < 0 ? 'text-danger' : 'text-fg'}>
                  {fmt.currency(b?.netProfit ?? null, currency)}
                  {b?.marginPct != null && <span className="ms-1 text-xs text-muted">({b.marginPct}%)</span>}
                </Td>
                <Td align="end">{fmt.currency(row.breakEven, currency)}</Td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      <p className="text-xs text-muted">{t.sellerTools.feesExplained}</p>
      <FeesNote updatedAt={data.rows[0]?.feesUpdatedAt} />
    </>
  );
}

function BestPlatform({ base, currency }: { base: string; currency: string }) {
  const { t, fmt } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['seller-tools', base, 'best'],
    queryFn: () => get<{ hasCost: boolean; rows: BestRow[] }>(`${base}/best-platform`),
  });
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  if (data.rows.length === 0) return <p className="text-sm text-muted">{t.sellerTools.noFees}</p>;
  return (
    <>
      {!data.hasCost && <p className="text-xs text-warning">{t.sellerTools.needCost}</p>}
      <Table>
        <THead>
          <tr>
            <Th>{t.seller.store}</Th>
            <Th align="end">{t.sellerTools.sellsAt}</Th>
            <Th align="end">{t.sellerTools.net}</Th>
          </tr>
        </THead>
        <TBody>
          {data.rows.map((row, index) => (
            <tr key={row.platform.id}>
              <Td>
                <span className="inline-flex items-center gap-2">
                  {row.platform.name}
                  {index === 0 && row.netProfit != null && <Badge variant="success">{t.sellerTools.best}</Badge>}
                </span>
              </Td>
              <Td align="end">
                {fmt.currency(row.priceUsed, currency)}
                {row.priceSource === 'YOURS' && <span className="ms-1 text-xs text-muted">({t.sellerTools.yourPriceShort})</span>}
              </Td>
              <Td align="end">
                {fmt.currency(row.netProfit, currency)}
                {row.marginPct != null && <span className="ms-1 text-xs text-muted">({row.marginPct}%)</span>}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}

function Repricer({ base, currency }: { base: string; currency: string }) {
  const { t, fmt } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  const key = ['seller-tools', base, 'repricer'];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => get<RepricerState>(`${base}/repricer`) });
  const [form, setForm] = useState<{ strategy: string; offset: string; floor: string; ceiling: string } | null>(null);
  const done = (state: RepricerState) => {
    queryClient.setQueryData(key, state);
    queryClient.invalidateQueries({ queryKey: ['seller'] });
    setForm(null);
  };
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiClient.put<ApiResponse<RepricerState>>(`${base}/repricer`, body)).data.data,
    onSuccess: (state) => {
      done(state);
      addToast(t.sellerTools.saved, 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.saveFailed), 'error'),
  });
  const apply = useMutation({
    mutationFn: async () => (await apiClient.post<ApiResponse<RepricerState>>(`${base}/repricer/apply`)).data.data,
    onSuccess: (state) => {
      done(state);
      addToast(t.sellerTools.applied, 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.saveFailed), 'error'),
  });
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;

  const fields = form ?? {
    strategy: data.strategy ?? '',
    offset: data.offset.toString(),
    floor: data.floor?.toString() ?? '',
    ceiling: data.ceiling?.toString() ?? '',
  };
  const num = (value: string) => (value === '' ? null : Number(value));
  const reasons = t.sellerTools.reasons as Record<string, string>;
  const sources = t.sellerTools.sources as Record<string, string>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t.sellerTools.rule}
          value={fields.strategy}
          onChange={(event) => setForm({ ...fields, strategy: event.target.value })}
          options={[
            { value: '', label: t.sellerTools.off },
            { value: 'BEAT_LOWEST', label: t.sellerTools.beatLowest },
            { value: 'MATCH_LOWEST', label: t.sellerTools.matchLowest },
          ]}
        />
        <Input label={t.sellerTools.offset} type="number" dir="ltr" min="0" value={fields.offset} disabled={fields.strategy !== 'BEAT_LOWEST'} onChange={(e) => setForm({ ...fields, offset: e.target.value })} />
        <Input label={t.sellerTools.floor} type="number" dir="ltr" min="0" value={fields.floor} onChange={(e) => setForm({ ...fields, floor: e.target.value })} />
        <Input label={t.sellerTools.ceiling} type="number" dir="ltr" min="0" value={fields.ceiling} onChange={(e) => setForm({ ...fields, ceiling: e.target.value })} />
      </div>
      <Button
        className="self-start"
        loading={save.isPending}
        onClick={() =>
          save.mutate({
            strategy: fields.strategy || null,
            offset: Number(fields.offset) || 0,
            floor: num(fields.floor),
            ceiling: num(fields.ceiling),
          })
        }
      >
        {t.sellerTools.saveRule}
      </Button>

      {data.strategy && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-2 p-3">
          <div className="flex flex-col gap-1">
            <span className="label-mono text-muted">{t.sellerTools.suggested}</span>
            <span className="text-lg font-semibold tabular-nums text-brand-text">{fmt.currency(data.suggestedPrice, currency)}</span>
            {data.suggestionReason && <span className="text-xs text-muted">{reasons[data.suggestionReason] ?? data.suggestionReason}</span>}
          </div>
          {data.suggestedPrice != null && data.suggestedPrice !== data.currentPrice && (
            <Button size="sm" variant="secondary" loading={apply.isPending} onClick={() => apply.mutate()}>
              {t.sellerTools.apply}
            </Button>
          )}
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        {t.sellerTools.autoUnavailable}
      </p>

      {data.log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{t.sellerTools.history}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {data.log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-muted">
                  {fmt.date(entry.createdAt)} · {sources[entry.source] ?? entry.source}
                </span>
                <span className="tabular-nums text-fg" dir="ltr">
                  {fmt.currency(entry.oldPrice, currency)} → {fmt.currency(entry.newPrice, currency)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Ranks({ base, orgId }: { base: string; orgId: string }) {
  const { t, tf } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  const key = ['seller-tools', base, 'ranks'];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => get<RankRow[]>(`${base}/ranks`) });
  const { data: platforms } = useQuery({
    queryKey: ['seller-tools', 'rank-platforms'],
    queryFn: () => get<Array<{ id: string; name: string }>>('/seller/rank-platforms'),
    staleTime: 60 * 60 * 1000,
  });
  const [platformId, setPlatformId] = useState('');
  const [keyword, setKeyword] = useState('');
  const add = useMutation({
    mutationFn: async () => (await apiClient.post(`${base}/ranks`, { platformId, keyword: keyword.trim() })).data,
    onSuccess: () => {
      setKeyword('');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.saveFailed), 'error'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/seller/workspaces/${orgId}/ranks/${id}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (platformId && keyword.trim().length >= 2) add.mutate();
        }}
      >
        <Select
          label={t.seller.store}
          value={platformId}
          placeholder={t.sellerTools.pickStore}
          onChange={(event) => setPlatformId(event.target.value)}
          options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
        <Input label={t.sellerTools.keyword} value={keyword} maxLength={160} dir="auto" onChange={(event) => setKeyword(event.target.value)} />
        <Button type="submit" variant="secondary" loading={add.isPending} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
          {t.sellerTools.track}
        </Button>
      </form>
      {data.length === 0 ? (
        <p className="text-sm text-muted">{t.sellerTools.noKeywords}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm text-fg" dir="auto">
                  {row.keyword} · <span className="text-muted">{row.platform.name}</span>
                </span>
                <span className="text-xs text-muted">
                  {!row.latest
                    ? t.sellerTools.notCheckedYet
                    : row.latest.position === null
                      ? tf(t.sellerTools.notInTop, { n: row.latest.scanned })
                      : tf(t.sellerTools.position, { n: row.latest.position, of: row.latest.scanned })}
                  {row.history.length > 1 && (
                    <span className="ms-2" dir="ltr">
                      {row.history
                        .slice(-7)
                        .map((h) => (h.position === null ? '–' : `#${h.position}`))
                        .join(' · ')}
                    </span>
                  )}
                </span>
              </div>
              <Button size="sm" variant="ghost" aria-label={t.sellerTools.stopTracking} onClick={() => remove.mutate(row.id)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t.sellerTools.ranksExplained}</p>
    </>
  );
}

function CompetitorTimeline({ base, currency }: { base: string; currency: string }) {
  const { t, fmt } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['seller-tools', base, 'timeline'],
    queryFn: () => get<Timeline>(`${base}/timeline`, { days: 90 }),
  });
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  if (data.stores.length === 0) return <p className="text-sm text-muted">{t.sellerTools.noTimeline}</p>;
  const eventTypes = t.sellerTools.eventTypes as Record<string, string>;
  return (
    <>
      <Table>
        <THead>
          <tr>
            <Th>{t.seller.store}</Th>
            <Th align="end">{t.sellerTools.now}</Th>
            <Th align="end">{t.sellerTools.low90}</Th>
            <Th align="end">{t.sellerTools.high90}</Th>
          </tr>
        </THead>
        <TBody>
          {data.stores.map((store) => {
            const prices = store.points.map((p) => p.price);
            return (
              <tr key={store.platformId}>
                <Td>{store.platformName}</Td>
                <Td align="end">{fmt.currency(store.points.at(-1)?.price ?? null, currency)}</Td>
                <Td align="end">{fmt.currency(Math.min(...prices), currency)}</Td>
                <Td align="end">{fmt.currency(Math.max(...prices), currency)}</Td>
              </tr>
            );
          })}
        </TBody>
      </Table>
      {data.events.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.events.slice(0, 15).map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-fg">
                {event.platformName} · {eventTypes[event.type] ?? event.type}
              </span>
              <span className="text-muted">{fmt.date(event.detectedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Workspace-level: import products by CSV or link, and export repricer suggestions. */
export function SellerImport({ orgId }: { orgId: string }) {
  const { t, tf } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  const repricer = useEntitlement('repricer_suggest');
  const [csv, setCsv] = useState('');
  const [url, setUrl] = useState('');
  const [report, setReport] = useState<{ created: number; updated: number; linked: number; errors: Array<{ line: number; message: string }> } | null>(null);
  const base = `/seller/workspaces/${orgId}`;

  const importCsv = useMutation({
    mutationFn: async () => (await apiClient.post<ApiResponse<NonNullable<typeof report>>>(`${base}/import/csv`, { csv })).data.data,
    onSuccess: (result) => {
      setReport(result);
      setCsv('');
      queryClient.invalidateQueries({ queryKey: ['seller', orgId] });
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.importFailed), 'error'),
  });
  const importUrl = useMutation({
    mutationFn: async () => (await apiClient.post<ApiResponse<{ linked: boolean; created: boolean }>>(`${base}/import/url`, { url: url.trim() })).data.data,
    onSuccess: (result) => {
      setUrl('');
      addToast(result.linked ? t.sellerTools.urlLinked : t.sellerTools.urlPending, 'success');
      queryClient.invalidateQueries({ queryKey: ['seller', orgId] });
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.importFailed), 'error'),
  });
  const exportCsv = useMutation({
    mutationFn: async () => (await apiClient.get<ApiResponse<{ csv: string }>>(`${base}/repricer/export`)).data.data.csv,
    onSuccess: (text) => {
      const blob = new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'pricelens-repricer.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    },
    onError: (err: AxiosError) => addToast(apiError(err, t.sellerTools.saveFailed), 'error'),
  });

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <h2 className="text-sm font-semibold text-fg">{t.sellerTools.importTitle}</h2>
        {repricer === 'available' && (
          <Button size="sm" variant="ghost" loading={exportCsv.isPending} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => exportCsv.mutate()}>
            {t.sellerTools.exportSuggestions}
          </Button>
        )}
      </CardHeader>
      <CardBody className="grid gap-6 lg:grid-cols-2">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) importUrl.mutate();
          }}
        >
          <Input label={t.sellerTools.byLink} type="url" dir="ltr" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          <p className="text-xs text-muted">{t.sellerTools.byLinkHint}</p>
          <Button type="submit" variant="secondary" className="self-start" loading={importUrl.isPending}>
            {t.sellerTools.addLink}
          </Button>
        </form>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-fg" htmlFor="seller-csv">
            {t.sellerTools.byCsv}
          </label>
          <textarea
            id="seller-csv"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={4}
            dir="ltr"
            placeholder={'sku,name,cost,price,url'}
            className="w-full rounded border border-border bg-surface p-3 font-mono text-xs text-fg focus:border-brand focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-xs text-muted"
              aria-label={t.sellerTools.chooseFile}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
            <Button variant="secondary" loading={importCsv.isPending} disabled={!csv.trim()} onClick={() => importCsv.mutate()}>
              {t.sellerTools.importCsv}
            </Button>
          </div>
          <p className="text-xs text-muted">{t.sellerTools.csvHint}</p>
          {report && (
            <div className="flex flex-col gap-1 rounded-sm bg-surface-2 p-3 text-xs">
              <span className="text-fg">{tf(t.sellerTools.importReport, { created: report.created, updated: report.updated, linked: report.linked })}</span>
              {report.errors.map((error) => (
                <span key={`${error.line}-${error.message}`} className="text-danger" dir="ltr">
                  {error.line > 0 ? `${error.line}: ` : ''}
                  {error.message}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
