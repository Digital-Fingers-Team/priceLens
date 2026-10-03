'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { businessApi } from '@/lib/api/business.api';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import { FEATURES } from '@/types/billing.types';
import type { IssuedApiKey } from '@/types/business.types';
import { DownloadButton, Gate } from './shared';

// ── Reports ──────────────────────────────────────────────────────────────

export function ReportsSection({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  return (
    <Gate feature={FEATURES.MARKET_REPORTS} title={t.business.reports.title}>
      <Reports orgId={orgId} />
    </Gate>
  );
}

function Reports({ orgId }: { orgId: string }) {
  const { t, tf, fmt } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['business', orgId, 'reports'], queryFn: () => businessApi.reports(orgId) });
  const generate = useMutation({
    mutationFn: (period: 'WEEKLY' | 'MONTHLY') => businessApi.generateReport(orgId, period),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['business', orgId, 'reports'] });
      setOpenId(report.id);
    },
    onError: () => addToast(t.toast.saveFailed, 'error'),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-fg">{t.business.reports.title}</h2>
            <p className="text-sm text-muted">{t.business.reports.lede}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" loading={generate.isPending && generate.variables === 'WEEKLY'} onClick={() => generate.mutate('WEEKLY')}>
              {t.business.reports.generateWeekly}
            </Button>
            <Button size="sm" variant="secondary" loading={generate.isPending && generate.variables === 'MONTHLY'} onClick={() => generate.mutate('MONTHLY')}>
              {t.business.reports.generateMonthly}
            </Button>
          </div>
        </CardHeader>
        {isLoading ? (
          <CardBody>
            <Skeleton className="h-24 w-full" />
          </CardBody>
        ) : !data || data.length === 0 ? (
          <EmptyState title={t.business.reports.empty} description={t.business.reports.emptyBody} />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-fg">
                    {report.period === 'WEEKLY' ? t.business.reports.weekly : t.business.reports.monthly} · {fmt.date(report.periodStart)} – {fmt.date(report.periodEnd)}
                  </p>
                  <p className="text-xs text-muted">{tf(t.business.reports.generated, { date: fmt.date(report.generatedAt) })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOpenId(openId === report.id ? null : report.id)}>
                    {t.business.reports.open}
                  </Button>
                  <DownloadButton path={businessApi.reportFilePath(orgId, report.id, 'pdf')} filename="market-report.pdf" label={t.business.pdf} />
                  <DownloadButton path={businessApi.reportFilePath(orgId, report.id, 'csv')} filename="market-report.csv" label={t.business.csv} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {openId && <ReportView orgId={orgId} reportId={openId} />}
    </div>
  );
}

function ReportView({ orgId, reportId }: { orgId: string; reportId: string }) {
  const { t, fmt } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ['business', orgId, 'report', reportId], queryFn: () => businessApi.report(orgId, reportId) });
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;
  const { headline, sections, dataNote } = data.payload;
  const tiles: Array<[string, number]> = [
    [t.business.reports.products, headline.productsMonitored],
    [t.business.reports.priceChanges, headline.priceChanges],
    [t.business.reports.newProducts, headline.newProducts],
    [t.business.reports.mapViolations, headline.mapViolations],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 bg-surface p-4">
            <dt className="label-mono text-muted">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums text-fg">{fmt.number(value)}</dd>
          </div>
        ))}
      </dl>
      {sections.map((section) => {
        const keys = section.rows[0] ? Object.keys(section.rows[0]) : [];
        return (
          <Card key={section.key}>
            <CardHeader>
              <h3 className="text-sm font-semibold text-fg">{section.title}</h3>
            </CardHeader>
            {section.rows.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">{section.emptyNote}</p>
              </CardBody>
            ) : (
              <Table wide>
                <THead>
                  <tr>
                    {keys.map((key) => (
                      <Th key={key}>{key}</Th>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {section.rows.map((row, index) => (
                    <tr key={index}>
                      {keys.map((key) => (
                        <Td key={key} dir="auto">
                          {row[key] ?? '—'}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-muted">{dataNote}</p>
    </div>
  );
}

// ── API keys ─────────────────────────────────────────────────────────────

export function ApiSection({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  return (
    <Gate feature={FEATURES.API_ACCESS} title={t.business.api.title}>
      <ApiKeys orgId={orgId} />
    </Gate>
  );
}

function ApiKeys({ orgId }: { orgId: string }) {
  const { t, fmt } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [market, setMarket] = useState(true);
  const [events, setEvents] = useState(false);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = useQuery({ queryKey: ['business', orgId, 'keys'], queryFn: () => businessApi.apiKeys(orgId) });
  const usage = useQuery({ queryKey: ['business', orgId, 'usage'], queryFn: () => businessApi.apiUsage(orgId, 30) });
  const create = useMutation({
    mutationFn: () => businessApi.issueKey(orgId, { name: name.trim(), scopes: [...(market ? ['market:read'] : []), ...(events ? ['events:read'] : [])] }),
    onSuccess: (key) => {
      setIssued(key);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['business', orgId, 'keys'] });
    },
    onError: () => addToast(t.toast.saveFailed, 'error'),
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => businessApi.revokeKey(orgId, keyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business', orgId, 'keys'] }),
  });

  const totals = (usage.data?.daily ?? []).reduce((sum, day) => ({ calls: sum.calls + day.calls, errors: sum.errors + day.errors }), { calls: 0, errors: 0 });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <KeyRound className="h-4 w-4 text-brand-text" aria-hidden />
              {t.business.api.title}
            </h2>
            <p className="text-sm text-muted">{t.business.api.lede}</p>
          </div>
          <Link href="/developers" className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
            {t.business.api.docs}
          </Link>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input label={t.business.api.name} value={name} onChange={(e) => setName(e.target.value)} dir="auto" wrapperClassName="flex-1" />
            <Button loading={create.isPending} disabled={name.trim().length < 2 || (!market && !events)} onClick={() => create.mutate()}>
              {t.business.api.create}
            </Button>
          </div>
          <fieldset className="flex flex-col">
            <legend className="text-xs font-medium text-muted">{t.business.api.scopes}</legend>
            <Checkbox label={t.business.api.scopeMarket} checked={market} onChange={(e) => setMarket(e.target.checked)} />
            <Checkbox label={t.business.api.scopeEvents} checked={events} onChange={(e) => setEvents(e.target.checked)} />
          </fieldset>
          {issued && (
            <div role="status" className="flex flex-col gap-2 rounded border border-warning/40 bg-warning-soft p-4">
              <p className="text-sm font-medium text-fg">{t.business.api.yourKey}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-surface px-2 py-1 font-mono text-xs text-fg" dir="ltr">
                  {issued.key}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Copy className="h-4 w-4" aria-hidden />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(issued.key);
                    setCopied(true);
                  }}
                >
                  {copied ? t.business.api.copied : t.business.api.copy}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
        {keys.isLoading ? (
          <CardBody>
            <Skeleton className="h-20 w-full" />
          </CardBody>
        ) : !keys.data || keys.data.length === 0 ? (
          <EmptyState title={t.business.api.empty} />
        ) : (
          <Table wide>
            <THead>
              <tr>
                <Th>{t.business.api.name}</Th>
                <Th>{t.business.api.prefix}</Th>
                <Th>{t.business.api.scopes}</Th>
                <Th>{t.business.api.lastUsed}</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {keys.data.map((key) => (
                <tr key={key.id}>
                  <Td dir="auto">{key.name}</Td>
                  <Td className="font-mono text-xs" dir="ltr">
                    {key.keyPrefix}…
                  </Td>
                  <Td className="text-xs text-muted" dir="ltr">
                    {key.scopes.join(', ')}
                  </Td>
                  <Td className="text-muted">{key.lastUsedAt ? fmt.date(key.lastUsedAt) : t.business.api.never}</Td>
                  <Td align="end">
                    {key.isActive ? (
                      <Button size="sm" variant="danger" loading={revoke.isPending && revoke.variables === key.id} onClick={() => revoke.mutate(key.id)}>
                        {t.business.api.revoke}
                      </Button>
                    ) : (
                      <Badge variant="outline">{t.business.api.revoked}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{t.business.api.usage}</h2>
        </CardHeader>
        <CardBody>
          {usage.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : totals.calls === 0 ? (
            <p className="text-sm text-muted">{t.business.api.noUsage}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border">
                <div className="flex flex-col gap-1 bg-surface p-4">
                  <dt className="label-mono text-muted">{t.business.api.calls}</dt>
                  <dd className="text-xl font-semibold tabular-nums text-fg">{fmt.number(totals.calls)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-surface p-4">
                  <dt className="label-mono text-muted">{t.business.api.errors}</dt>
                  <dd className="text-xl font-semibold tabular-nums text-fg">{fmt.number(totals.errors)}</dd>
                </div>
              </dl>
              <ul className="flex flex-col gap-1 text-sm">
                {(usage.data?.byEndpoint ?? []).map((row) => (
                  <li key={row.endpoint} className="flex justify-between gap-3">
                    <span className="font-mono text-xs text-muted" dir="ltr">
                      {row.endpoint}
                    </span>
                    <span className="tabular-nums">{fmt.number(row.calls)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
