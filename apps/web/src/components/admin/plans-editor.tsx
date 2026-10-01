'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminFlags, useAdminPlans, useUpdatePlan } from '@/lib/hooks/use-billing';
import type { AdminPlan, PlanLimits } from '@/types/billing.types';

/** Switches that no plan sells; everything else in the flag list is a plan feature. */
const OPERATIONAL = new Set(['paymob_checkout', 'mock_checkout', 'org_invites', 'price_daily_rollup', 'renewal_reminders']);

const NUMERIC_LIMITS: Array<{ key: keyof PlanLimits; label: string; nullable: boolean }> = [
  { key: 'trackedProducts', label: 'Tracked products', nullable: true },
  { key: 'activeAlerts', label: 'Active alerts', nullable: true },
  { key: 'priceHistoryDays', label: 'History days', nullable: true },
  { key: 'monitoredSkus', label: 'Monitored SKUs', nullable: true },
  { key: 'apiCallsPerDay', label: 'API calls / day', nullable: false },
  { key: 'seats', label: 'Seats', nullable: false },
];

/** Prices are edited in pounds and stored in piastres; blank limits mean unlimited. */
export function PlansEditor() {
  const { data, isLoading } = useAdminPlans();
  const { data: flags } = useAdminFlags();
  const features = (flags ?? []).map((flag) => flag.key).filter((key) => !OPERATIONAL.has(key));

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      {data.map((plan) => (
        <PlanCard key={plan.key} plan={plan} features={features} />
      ))}
    </div>
  );
}

function PlanCard({ plan, features }: { plan: AdminPlan; features: string[] }) {
  const update = useUpdatePlan();
  const [draft, setDraft] = useState(() => toDraft(plan));
  useEffect(() => setDraft(toDraft(plan)), [plan]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleFeature = (feature: string) =>
    set('features', draft.features.includes(feature) ? draft.features.filter((f) => f !== feature) : [...draft.features, feature]);

  const save = () => {
    const limits: Record<string, unknown> = { ...plan.limits, features: draft.features };
    for (const { key, nullable } of NUMERIC_LIMITS) {
      const raw = draft.limits[key].trim();
      limits[key] = raw === '' && nullable ? null : Math.max(0, Math.floor(Number(raw) || 0));
    }
    update.mutate({
      key: plan.key,
      patch: {
        name: draft.name,
        description: draft.description,
        priceMinor: Math.round(Number(draft.price) * 100) || 0,
        intervalDays: Number(draft.intervalDays) || 0,
        trialDays: Number(draft.trialDays) || 0,
        sortOrder: Number(draft.sortOrder) || 0,
        isActive: draft.isActive,
        isPublic: draft.isPublic,
        limits: limits as unknown as PlanLimits,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{plan.name}</h2>
          <code className="text-xs text-muted">{plan.key}</code>
          <Badge variant="outline">{plan.tier}</Badge>
          {!plan.isActive && <Badge variant="danger">inactive</Badge>}
          {!plan.isPublic && <Badge variant="neutral">hidden</Badge>}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          <Input label={`Price (${plan.currency})`} inputMode="decimal" dir="ltr" value={draft.price} onChange={(e) => set('price', e.target.value)} />
          <Input label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} wrapperClassName="sm:col-span-2" />
          <Input label="Period (days)" inputMode="numeric" dir="ltr" value={draft.intervalDays} onChange={(e) => set('intervalDays', e.target.value)} />
          <Input label="Trial (days)" inputMode="numeric" dir="ltr" value={draft.trialDays} onChange={(e) => set('trialDays', e.target.value)} />
          <Input label="Sort order" inputMode="numeric" dir="ltr" value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          <div className="flex flex-col justify-end gap-2">
            <Checkbox label="Active (can be bought and held)" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            <Checkbox label="Shown on the pricing page" checked={draft.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-mono text-muted">Limits (blank = unlimited)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {NUMERIC_LIMITS.map(({ key, label, nullable }) => (
              <Input
                key={key}
                label={label}
                inputMode="numeric"
                dir="ltr"
                placeholder={nullable ? 'unlimited' : '0'}
                value={draft.limits[key]}
                onChange={(e) => set('limits', { ...draft.limits, [key]: e.target.value })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-mono text-muted">Features</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {features.map((feature) => (
              <Checkbox
                key={feature}
                label={<code className="text-xs">{feature}</code>}
                checked={draft.features.includes(feature)}
                onChange={() => toggleFeature(feature)}
              />
            ))}
          </div>
        </fieldset>

        <Button className="self-start" loading={update.isPending} onClick={save}>
          Save {plan.name}
        </Button>
      </CardBody>
    </Card>
  );
}

interface Draft {
  name: string;
  description: string;
  price: string;
  intervalDays: string;
  trialDays: string;
  sortOrder: string;
  isActive: boolean;
  isPublic: boolean;
  features: string[];
  limits: Record<keyof PlanLimits, string>;
}

function toDraft(plan: AdminPlan): Draft {
  const limits = {} as Record<keyof PlanLimits, string>;
  for (const { key } of NUMERIC_LIMITS) {
    const value = plan.limits[key];
    limits[key] = value === null || value === undefined ? '' : String(value);
  }
  return {
    name: plan.name,
    description: plan.description ?? '',
    price: String(plan.priceMinor / 100),
    intervalDays: String(plan.intervalDays),
    trialDays: String(plan.trialDays),
    sortOrder: String(plan.sortOrder),
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    features: plan.limits.features,
    limits,
  };
}
