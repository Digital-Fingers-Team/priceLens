'use client';
import { useEffect, useMemo, useState } from 'react';
import { X, Bell, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/lib/store/ui.store';
import { useCreateAlert } from '@/lib/hooks/use-watchlist';
import type { AlertType } from '@/types/product.types';

const ALERT_TYPES: Array<{ label: string; value: AlertType; hint: string }> = [
  { label: 'Price target', value: 'PRICE_TARGET', hint: 'Alert me when it reaches a number.' },
  { label: 'Drop by amount', value: 'PRICE_DROP_ABSOLUTE', hint: 'Alert me if it falls by a set amount.' },
  { label: 'Drop by %', value: 'PRICE_DROP_PERCENT', hint: 'Alert me on a percentage drop.' },
];

export function AlertModal() {
  const productId = useUiStore((s) => s.alertProductId);
  const closeAlertModal = useUiStore((s) => s.closeAlertModal);
  const { mutate: createAlert, isPending } = useCreateAlert();
  const [type, setType] = useState<AlertType>('PRICE_TARGET');
  const [thresholdValue, setThresholdValue] = useState('0');

  useEffect(() => {
    if (productId) {
      setType('PRICE_TARGET');
      setThresholdValue('0');
    }
  }, [productId]);

  const selected = useMemo(() => ALERT_TYPES.find((item) => item.value === type), [type]);

  if (!productId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-50">Set a price alert</h2>
            <p className="text-sm text-ink-500">Get notified when this product hits your target.</p>
          </div>
          <button onClick={closeAlertModal} className="text-ink-500 hover:text-ink-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-2">
            {ALERT_TYPES.map((item) => (
              <button
                key={item.value}
                onClick={() => setType(item.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  type === item.value
                    ? 'border-signal/40 bg-signal/10'
                    : 'border-ink-700 bg-ink-900 hover:border-ink-500'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink-100">{item.label}</span>
                  {type === item.value && <TrendingDown className="w-4 h-4 text-signal" />}
                </div>
                <p className="mt-1 text-xs text-ink-500">{item.hint}</p>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-200">Threshold value</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              placeholder="Enter a number"
            />
            <p className="text-xs text-ink-500">
              Quick note: tighter target alerts usually work best for shoppers comparing prices over time.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeAlertModal}>Cancel</Button>
            <Button
              leftIcon={<Bell className="w-4 h-4" />}
              loading={isPending}
              onClick={() =>
                createAlert(
                  {
                    productId,
                    alertType: type,
                    thresholdValue: Number(thresholdValue),
                  },
                  {
                    onSuccess: closeAlertModal,
                  },
                )
              }
            >
              Save alert
            </Button>
          </div>
          {selected && (
            <p className="text-xs text-ink-600">
              You are creating a <span className="text-ink-300">{selected.label.toLowerCase()}</span> alert.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
