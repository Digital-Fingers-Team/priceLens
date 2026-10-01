'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, THead, Td, Th } from '@/components/ui/table';
import { adminApi } from '@/lib/api/admin.api';
import { apiClient } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useUiStore } from '@/lib/store/ui.store';
import type { ApiResponse } from '@/types/api.types';

type Row = Record<string, unknown> & { id: string };

function useRows(path: string) {
  return useQuery({ queryKey: ['admin', path], queryFn: async () => (await apiClient.get<ApiResponse<Row[]>>(path)).data.data });
}

function useWrite(path: string) {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  return useMutation({
    mutationFn: async (input: { method: 'post' | 'patch' | 'put' | 'delete'; url: string; body?: unknown }) =>
      (await apiClient.request({ method: input.method, url: input.url, data: input.body })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', path] });
      addToast('Saved', 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
}

function usePlatforms() {
  return useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await adminApi.getPlatforms()) as Array<{ id: string; name: string }>,
  });
}

const num = (value: string) => (value.trim() === '' ? null : Number(value));

/** Installment plans, card / cashback offers and coupons, warranty rules: all typed in from published terms. */
export function BuyerOffersAdmin() {
  return (
    <div className="flex flex-col gap-8">
      <Installments />
      <Promos />
      <Warranty />
    </div>
  );
}

function Installments() {
  const path = '/admin/installment-plans';
  const { data } = useRows(path);
  const { data: platforms } = usePlatforms();
  const write = useWrite(path);
  const empty = { provider: '', kind: 'BNPL', months: '6', markupPct: '0', adminFeePct: '0', adminFeeFlat: '0', downPaymentPct: '0', minAmount: '', maxAmount: '', platformId: '', validUntil: '', sourceUrl: '' };
  const [f, setF] = useState(empty);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">Installment plans</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Table>
          <THead>
            <tr>
              <Th>Provider</Th>
              <Th>Months</Th>
              <Th>Markup / fee / down</Th>
              <Th>Amounts</Th>
              <Th align="end"> </Th>
            </tr>
          </THead>
          <TBody>
            {(data ?? []).map((row) => (
              <tr key={row.id}>
                <Td>
                  {String(row.provider)} <Badge variant="outline">{String(row.kind)}</Badge> {!row.isActive && <Badge variant="neutral">off</Badge>}
                </Td>
                <Td>{String(row.months)}</Td>
                <Td>
                  {String(row.markupPct)}% / {String(row.adminFeePct)}% + {String(row.adminFeeFlat)} / {String(row.downPaymentPct)}%
                </Td>
                <Td>
                  {String(row.minAmount ?? '—')} – {String(row.maxAmount ?? '—')}
                </Td>
                <Td align="end">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'patch', url: `${path}/${row.id}`, body: { isActive: !row.isActive } })}>
                      {row.isActive ? 'Turn off' : 'Turn on'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'delete', url: `${path}/${row.id}` })}>
                      Delete
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Provider (valU, sympl, CIB card…)" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
          <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'BNPL', label: 'BNPL' }, { value: 'BANK_CARD', label: 'Bank card' }]} />
          <Input label="Months" inputMode="numeric" dir="ltr" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} />
          <Input label="Total markup % (whole tenor)" inputMode="decimal" dir="ltr" value={f.markupPct} onChange={(e) => setF({ ...f, markupPct: e.target.value })} />
          <Input label="Admin fee %" inputMode="decimal" dir="ltr" value={f.adminFeePct} onChange={(e) => setF({ ...f, adminFeePct: e.target.value })} />
          <Input label="Admin fee (EGP)" inputMode="decimal" dir="ltr" value={f.adminFeeFlat} onChange={(e) => setF({ ...f, adminFeeFlat: e.target.value })} />
          <Input label="Down payment %" inputMode="decimal" dir="ltr" value={f.downPaymentPct} onChange={(e) => setF({ ...f, downPaymentPct: e.target.value })} />
          <Select label="Store" value={f.platformId} placeholder="Every store" onChange={(e) => setF({ ...f, platformId: e.target.value })} options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Input label="Min amount (EGP)" inputMode="decimal" dir="ltr" value={f.minAmount} onChange={(e) => setF({ ...f, minAmount: e.target.value })} />
          <Input label="Max amount (EGP)" inputMode="decimal" dir="ltr" value={f.maxAmount} onChange={(e) => setF({ ...f, maxAmount: e.target.value })} />
          <Input label="Valid until" type="date" dir="ltr" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
          <Input label="Source URL" dir="ltr" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} />
        </div>
        <Button
          className="self-start"
          disabled={!f.provider || !f.months}
          loading={write.isPending}
          onClick={() =>
            write.mutate(
              {
                method: 'post',
                url: path,
                body: {
                  provider: f.provider,
                  kind: f.kind,
                  months: Number(f.months),
                  markupPct: Number(f.markupPct) || 0,
                  adminFeePct: Number(f.adminFeePct) || 0,
                  adminFeeFlat: Number(f.adminFeeFlat) || 0,
                  downPaymentPct: Number(f.downPaymentPct) || 0,
                  minAmount: num(f.minAmount),
                  maxAmount: num(f.maxAmount),
                  platformIds: f.platformId ? [f.platformId] : [],
                  validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null,
                  sourceUrl: f.sourceUrl || null,
                },
              },
              { onSuccess: () => setF(empty) },
            )
          }
        >
          Add plan
        </Button>
      </CardBody>
    </Card>
  );
}

function Promos() {
  const path = '/admin/promos';
  const { data } = useRows(path);
  const { data: platforms } = usePlatforms();
  const write = useWrite(path);
  const empty = { type: 'CARD', platformId: '', bankName: '', code: '', title: '', titleAr: '', valueType: 'PERCENT', value: '', maxDiscount: '', minSpend: '', validUntil: '', verified: true };
  const [f, setF] = useState(empty);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">Card offers, cashback and coupons</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Table>
          <THead>
            <tr>
              <Th>Offer</Th>
              <Th>Value</Th>
              <Th>Evidence</Th>
              <Th align="end"> </Th>
            </tr>
          </THead>
          <TBody>
            {(data ?? []).map((row) => (
              <tr key={row.id}>
                <Td>
                  <Badge variant="outline">{String(row.type)}</Badge> {String(row.title)}
                  <span className="block text-xs text-muted">
                    {[row.bankName, (row.platform as { name?: string } | null)?.name ?? 'all stores', row.code].filter(Boolean).join(' · ')}
                  </span>
                </Td>
                <Td>{row.valueType === 'PERCENT' ? `${row.value}%` : `${row.value} EGP`}</Td>
                <Td className="text-xs">
                  {row.verified ? `verified ${new Date(String(row.lastVerifiedAt)).toLocaleDateString()}` : 'not verified'} · {String(row.workedCount)}✓ {String(row.failedCount)}✗
                </Td>
                <Td align="end">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'patch', url: `${path}/${row.id}`, body: { verified: true } })}>
                      Verified now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'patch', url: `${path}/${row.id}`, body: { isActive: !row.isActive } })}>
                      {row.isActive ? 'Turn off' : 'Turn on'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'delete', url: `${path}/${row.id}` })}>
                      Delete
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={['CARD', 'CASHBACK', 'COUPON'].map((v) => ({ value: v, label: v }))} />
          <Select label="Store" value={f.platformId} placeholder="Every store" onChange={(e) => setF({ ...f, platformId: e.target.value })} options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Input label="Bank (card offers)" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
          <Input label="Code (coupons)" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <Input label="Title (English)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} wrapperClassName="sm:col-span-2" />
          <Input label="Title (Arabic)" dir="rtl" value={f.titleAr} onChange={(e) => setF({ ...f, titleAr: e.target.value })} wrapperClassName="sm:col-span-2" />
          <Select label="Value type" value={f.valueType} onChange={(e) => setF({ ...f, valueType: e.target.value })} options={[{ value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: 'EGP' }]} />
          <Input label="Value" inputMode="decimal" dir="ltr" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <Input label="Max discount (EGP)" inputMode="decimal" dir="ltr" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} />
          <Input label="Min spend (EGP)" inputMode="decimal" dir="ltr" value={f.minSpend} onChange={(e) => setF({ ...f, minSpend: e.target.value })} />
          <Input label="Valid until" type="date" dir="ltr" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
          <div className="flex items-end">
            <Checkbox label="I checked it just now" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
          </div>
        </div>
        <Button
          className="self-start"
          disabled={!f.title || !f.value}
          loading={write.isPending}
          onClick={() =>
            write.mutate(
              {
                method: 'post',
                url: path,
                body: {
                  type: f.type,
                  platformId: f.platformId || null,
                  bankName: f.bankName || null,
                  code: f.code || null,
                  title: f.title,
                  titleAr: f.titleAr || null,
                  valueType: f.valueType,
                  value: Number(f.value),
                  maxDiscount: num(f.maxDiscount),
                  minSpend: num(f.minSpend),
                  validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null,
                  verified: f.verified,
                },
              },
              { onSuccess: () => setF(empty) },
            )
          }
        >
          Add offer
        </Button>
      </CardBody>
    </Card>
  );
}

function Warranty() {
  const path = '/admin/warranty-rules';
  const { data } = useRows(path);
  const { data: platforms } = usePlatforms();
  const write = useWrite(path);
  const empty = { platformId: '', brand: '', type: 'LOCAL_AGENT', months: '12', agentName: '' };
  const [f, setF] = useState(empty);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">Warranty by store and brand</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Table>
          <THead>
            <tr>
              <Th>Store</Th>
              <Th>Brand</Th>
              <Th>Warranty</Th>
              <Th align="end"> </Th>
            </tr>
          </THead>
          <TBody>
            {(data ?? []).map((row) => (
              <tr key={row.id}>
                <Td>{(row.platform as { name?: string } | null)?.name}</Td>
                <Td>{String(row.brand ?? 'any brand')}</Td>
                <Td>
                  {String(row.type)} · {String(row.months)} months {row.agentName ? `· ${row.agentName}` : ''}
                </Td>
                <Td align="end">
                  <Button size="sm" variant="ghost" onClick={() => write.mutate({ method: 'delete', url: `${path}/${row.id}` })}>
                    Delete
                  </Button>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="grid gap-3 sm:grid-cols-5">
          <Select label="Store" value={f.platformId} placeholder="Choose" onChange={(e) => setF({ ...f, platformId: e.target.value })} options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Input label="Brand (blank = any)" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
          <Select
            label="Type"
            value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value })}
            options={['LOCAL_AGENT', 'INTERNATIONAL', 'SELLER', 'NONE'].map((v) => ({ value: v, label: v }))}
          />
          <Input label="Months" inputMode="numeric" dir="ltr" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} />
          <Input label="Agent name" value={f.agentName} onChange={(e) => setF({ ...f, agentName: e.target.value })} />
        </div>
        <Button
          className="self-start"
          disabled={!f.platformId}
          loading={write.isPending}
          onClick={() =>
            write.mutate(
              { method: 'put', url: path, body: { platformId: f.platformId, brand: f.brand || null, type: f.type, months: Number(f.months) || 0, agentName: f.agentName || null } },
              { onSuccess: () => setF(empty) },
            )
          }
        >
          Save rule
        </Button>
      </CardBody>
    </Card>
  );
}
