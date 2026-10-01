'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi } from '@/lib/api/admin.api';
import { apiClient } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useCategories } from '@/lib/hooks/use-search';
import { useUiStore } from '@/lib/store/ui.store';
import type { ApiResponse } from '@/types/api.types';

interface Rule {
  id: string;
  platformId: string;
  platform: { slug: string; name: string };
  categoryId: string | null;
  category: { slug: string; name: string } | null;
  shippingFlat: number;
  shippingPct: number;
  customsPct: number;
  vatPct: number;
  handlingFee: number;
  deliveryDays: string | null;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
}

const FIELDS = [
  ['customsPct', 'Customs %'],
  ['vatPct', 'VAT %'],
  ['shippingFlat', 'Shipping (EGP)'],
  ['shippingPct', 'Shipping %'],
  ['handlingFee', 'Fees (EGP)'],
] as const;

const KEY = ['admin', 'landed-cost-rules'];

/** Customs, VAT and shipping per cross-border store (and optionally per category). */
export function LandedCostRules() {
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();
  const { data: rules, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<ApiResponse<Rule[]>>('/admin/landed-cost-rules')).data.data,
  });
  const { data: platforms } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await adminApi.getPlatforms()) as Array<{ id: string; name: string; slug: string }>,
  });
  const { data: categories } = useCategories();

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiClient.put('/admin/landed-cost-rules', body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      addToast('Rule saved', 'success');
    },
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/landed-cost-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (err: AxiosError) => addToast(apiError(err), 'error'),
  });

  const [newPlatform, setNewPlatform] = useState('');
  const [newCategory, setNewCategory] = useState('');

  if (isLoading || !rules) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} saving={save.isPending} onSave={(body) => save.mutate(body)} onDelete={() => remove.mutate(rule.id)} />
      ))}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">Add a rule</h2>
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
          <Select
            label="Category (optional)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Every category (store default)"
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            wrapperClassName="flex-1"
          />
          <Button
            disabled={!newPlatform}
            loading={save.isPending}
            onClick={() => save.mutate({ platformId: newPlatform, categoryId: newCategory || null, vatPct: 14 })}
          >
            Add
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function RuleCard({ rule, saving, onSave, onDelete }: { rule: Rule; saving: boolean; onSave: (body: Record<string, unknown>) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(rule));
  useEffect(() => setDraft(toDraft(rule)), [rule]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{rule.platform.name}</h2>
          <Badge variant="outline">{rule.category ? rule.category.name : 'All categories'}</Badge>
          {!rule.isActive && <Badge variant="neutral">off</Badge>}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-5">
          {FIELDS.map(([key, label]) => (
            <Input key={key} label={label} inputMode="decimal" dir="ltr" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Delivery days (shown as-is)" dir="ltr" value={draft.deliveryDays} onChange={(e) => setDraft({ ...draft, deliveryDays: e.target.value })} />
          <Input label="Notes (admin only)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <Checkbox label="Active" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
        <div className="flex gap-2">
          <Button
            loading={saving}
            onClick={() =>
              onSave({
                platformId: rule.platformId,
                categoryId: rule.categoryId,
                ...Object.fromEntries(FIELDS.map(([key]) => [key, Number(draft[key]) || 0])),
                deliveryDays: draft.deliveryDays.trim() || null,
                notes: draft.notes.trim() || null,
                isActive: draft.isActive,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
        <p className="text-xs text-muted">Last changed {new Date(rule.updatedAt).toLocaleString()}</p>
      </CardBody>
    </Card>
  );
}

function toDraft(rule: Rule) {
  return {
    customsPct: String(rule.customsPct),
    vatPct: String(rule.vatPct),
    shippingFlat: String(rule.shippingFlat),
    shippingPct: String(rule.shippingPct),
    handlingFee: String(rule.handlingFee),
    deliveryDays: rule.deliveryDays ?? '',
    notes: rule.notes ?? '',
    isActive: rule.isActive,
  };
}
