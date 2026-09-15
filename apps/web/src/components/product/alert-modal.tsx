'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/lib/store/ui.store';
import { useCreateAlert } from '@/lib/hooks/use-watchlist';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { cn } from '@/lib/utils/cn';
import type { AlertType } from '@/types/billing.types';

interface AlertTypeMeta {
  value: AlertType;
  label: string;
  hint: string;
  /** Label for the threshold field; null when the type takes no threshold. */
  unit: 'currency' | 'percent' | null;
  defaultValue: string;
}

const ALERT_TYPES: AlertTypeMeta[] = [
  {
    value: 'PRICE_TARGET',
    label: 'Reaches my price',
    hint: 'Tell me when it hits a number I choose.',
    unit: 'currency',
    defaultValue: '',
  },
  {
    value: 'PRICE_DROP_PERCENT',
    label: 'Drops by a percentage',
    hint: 'Measured against the price when you set the alert.',
    unit: 'percent',
    defaultValue: '10',
  },
  {
    value: 'PRICE_DROP_ABSOLUTE',
    label: 'Drops by an amount',
    hint: 'Measured against the price when you set the alert.',
    unit: 'currency',
    defaultValue: '',
  },
  {
    value: 'LOWEST_EVER',
    label: 'Hits its lowest ever',
    hint: 'Fires only when it matches or beats every price we have recorded.',
    unit: null,
    defaultValue: '0',
  },
  {
    value: 'MAJOR_DISCOUNT',
    label: 'Falls well below its usual price',
    hint: 'Compared against what it actually sold for, not an advertised discount.',
    unit: 'percent',
    defaultValue: '15',
  },
  {
    value: 'RESTOCK',
    label: 'Comes back in stock',
    hint: 'Fires on the transition from out of stock to available.',
    unit: null,
    defaultValue: '0',
  },
  {
    value: 'PRICE_INCREASE',
    label: 'Goes up',
    hint: 'Useful if you are waiting and want to know the window is closing.',
    unit: 'percent',
    defaultValue: '10',
  },
];

export function AlertModal() {
  const productId = useUiStore((s) => s.alertProductId);
  const closeAlertModal = useUiStore((s) => s.closeAlertModal);
  const { mutate: createAlert, isPending } = useCreateAlert();
  const { entitlements, usage } = useEntitlements();

  const [type, setType] = useState<AlertType>('PRICE_TARGET');
  const [thresholdValue, setThresholdValue] = useState('');
  const [repeatable, setRepeatable] = useState(false);

  const allowedTypes = entitlements?.limits.alertTypes ?? ['PRICE_TARGET', 'PRICE_DROP_PERCENT'];
  const currency = 'EGP';

  useEffect(() => {
    if (productId) {
      setType('PRICE_TARGET');
      setThresholdValue('');
      setRepeatable(false);
    }
  }, [productId]);

  const selected = useMemo(() => ALERT_TYPES.find((item) => item.value === type)!, [type]);

  // A limit of null is unlimited; only a real number can be exhausted.
  const alertLimit = entitlements?.limits.activeAlerts ?? null;
  const atLimit = alertLimit !== null && usage.activeAlerts >= alertLimit;

  const thresholdRequired = selected.unit !== null;
  const parsedThreshold = Number(thresholdValue);
  const thresholdValid =
    !thresholdRequired || (Number.isFinite(parsedThreshold) && parsedThreshold > 0 &&
      (selected.unit !== 'percent' || parsedThreshold <= 95));

  if (!productId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-6 sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-950 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-800 bg-ink-950 px-5 py-4">
          <div>
            <h2 id="alert-modal-title" className="text-lg font-semibold text-ink-50">
              Set an alert
            </h2>
            <p className="text-sm text-ink-500">We will tell you the moment it happens.</p>
          </div>
          <button onClick={closeAlertModal} aria-label="Close" className="text-ink-500 hover:text-ink-200">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {atLimit && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200">
              You are using all {alertLimit} of your active alerts.{' '}
              <Link href="/pricing" className="font-medium underline">
                Upgrade for more
              </Link>
              , or delete one you no longer need.
            </div>
          )}

          <fieldset className="grid gap-2">
            <legend className="sr-only">Alert type</legend>
            {ALERT_TYPES.map((item) => {
              const locked = !allowedTypes.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    setType(item.value);
                    setThresholdValue(item.defaultValue);
                  }}
                  aria-pressed={type === item.value}
                  disabled={locked}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition-colors',
                    locked
                      ? 'cursor-not-allowed border-ink-800 bg-ink-900/40 opacity-60'
                      : type === item.value
                        ? 'border-signal/40 bg-signal/10'
                        : 'border-ink-700 bg-ink-900 hover:border-ink-500',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn('font-medium', locked ? 'text-ink-500' : 'text-ink-100')}>
                      {item.label}
                    </span>
                    {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-ink-600" aria-hidden />}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{item.hint}</p>
                </button>
              );
            })}
          </fieldset>

          {allowedTypes.length < ALERT_TYPES.length && (
            <Link
              href="/pricing"
              className="block rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/10"
            >
              Plus unlocks lowest-ever, restock, major-discount and price-increase alerts.
            </Link>
          )}

          {thresholdRequired && (
            <div className="space-y-2">
              <label htmlFor="alert-threshold" className="text-sm font-medium text-ink-200">
                {selected.unit === 'percent' ? 'Percentage' : `Amount (${currency})`}
              </label>
              <Input
                id="alert-threshold"
                type="number"
                min="0"
                max={selected.unit === 'percent' ? '95' : undefined}
                step={selected.unit === 'percent' ? '1' : '0.01'}
                value={thresholdValue}
                onChange={(event) => setThresholdValue(event.target.value)}
                placeholder={selected.unit === 'percent' ? 'e.g. 15' : 'e.g. 12000'}
              />
              <p className="text-xs text-ink-500">
                {selected.value === 'PRICE_TARGET'
                  ? `Example: enter 12000 to be told when it reaches 12,000 ${currency}.`
                  : selected.unit === 'percent'
                    ? 'Between 1 and 95.'
                    : `In ${currency}.`}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={repeatable}
              onChange={(event) => setRepeatable(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-800"
            />
            <span className="text-xs text-ink-400">
              <span className="font-medium text-ink-200">Keep watching after it fires</span>
              <br />
              Otherwise the alert stops after the first time. Repeat alerts wait at least a day between
              notifications.
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={closeAlertModal}>
              Cancel
            </Button>
            <Button
              leftIcon={<Bell className="h-4 w-4" />}
              loading={isPending}
              disabled={atLimit || !thresholdValid}
              onClick={() =>
                createAlert(
                  {
                    productId,
                    alertType: type,
                    thresholdValue: thresholdRequired ? parsedThreshold : 0,
                    repeatable,
                  },
                  { onSuccess: closeAlertModal },
                )
              }
            >
              Save alert
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
