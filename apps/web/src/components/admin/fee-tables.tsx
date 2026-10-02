'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/lib/api/admin.api';
import { apiClient } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useUiStore } from '@/lib/store/ui.store';
import type { ApiResponse } from '@/types/api.types';

interface FeeTable {
  id: string;
  platformId: string;
  platform: { id: string; name: string; slug: string };
  categoryKey: string;
  commissionPct: number;
  fixedFee: number;
  shippingFee: number;
  returnRatePct: number;
  vatPct: number;
  notes: string | null;
  updatedAt: string;
}

const FIELDS = [
  ['commissionPct', 'Commission %'],
  ['fixedFee', 'Fixed fee (EGP)'],
  ['shippingFee', 'Shipping (EGP)'],
  ['returnRatePct', 'Returns %'],
  ['vatPct', 'VAT %'],
] as const;

type Draft = Record<(typeof FIELDS)[number][0], string> & { notes: string };

const KEY = ['admin', 'fee-tables'];

const toDraft = (row: FeeTable): Draft => ({
  commissionPct: String(row.commissionPct),
  fixedFee: String(row.fixedFee),
  shippingFee: String(row.shippingFee),
  returnRatePct: String(row.returnRatePct),
  vatPct: String(row.vatPct),
  notes: row.notes ?? '',
});

/** Selling fees per store, optionally per category, for the sellers' profit tools. */
export function FeeTables() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  const { data: rows, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<ApiResponse<FeeTable[]>>('/admin/fee-tables')).data.data,
  });
  const { data: platforms } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await adminApi.getPlatforms()) as Array<{ id: string; name: string; slug: string }>,
  });
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiClient.put('/admin/fee-tables', body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      addToast('Fees saved', 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/fee-tables/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
  const [newPlatform, setNewPlatform] = useState('');
  const [newCategory, setNewCategory] = useState('');

  if (isLoading || !rows) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 && <p className="text-sm text-muted">No fee tables yet: sellers see no profit figures until one exists.</p>}
      {rows.map((row) => (
        <FeeCard key={row.id} row={row} saving={save.isPending} onSave={(body) => save.mutate(body)} onDelete={() => remove.mutate(row.id)} />
      ))}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">Add fees for a store</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="Store"
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            placeholder="Choose a store"
            options={(platforms ?? []).map((p) => ({ value: p.id, label: p.name }))}
            wrapperClassName="flex-1"
          />
          <Input label="Category slug (optional)" dir="ltr" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} wrapperClassName="flex-1" />
          <Button
            disabled={!newPlatform}
            loading={save.isPending}
            onClick={() => save.mutate({ platformId: newPlatform, categoryKey: newCategory.trim(), commissionPct: 0 })}
          >
            Add
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function FeeCard({ row, saving, onSave, onDelete }: { row: FeeTable; saving: boolean; onSave: (body: Record<string, unknown>) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(row));
  useEffect(() => setDraft(toDraft(row)), [row]);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{row.platform.name}</h2>
          <Badge variant="outline">{row.categoryKey || 'Store default'}</Badge>
          <span className="text-xs text-muted">Updated {new Date(row.updatedAt).toLocaleDateString('en-GB')}</span>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-5">
          {FIELDS.map(([key, label]) => (
            <Input key={key} label={label} inputMode="decimal" dir="ltr" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          ))}
        </div>
        <Input label="Source / notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        <div className="flex gap-2">
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                platformId: row.platformId,
                categoryKey: row.categoryKey,
                commissionPct: Number(draft.commissionPct) || 0,
                fixedFee: Number(draft.fixedFee) || 0,
                shippingFee: Number(draft.shippingFee) || 0,
                returnRatePct: Number(draft.returnRatePct) || 0,
                vatPct: Number(draft.vatPct) || 0,
                notes: draft.notes.trim() || undefined,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
