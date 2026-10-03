'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useCreateAlert } from '@/lib/hooks/use-watchlist';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import { cn } from '@/lib/utils/cn';
import type { AlertType } from '@/types/billing.types';

interface AlertTypeMeta {
  value: AlertType;
  /** What the threshold is measured in; null when the type takes none. */
  unit: 'currency' | 'percent' | null;
  defaultValue: string;
}

const ALERT_TYPES: AlertTypeMeta[] = [
  { value: 'PRICE_TARGET', unit: 'currency', defaultValue: '' },
  { value: 'PRICE_DROP_PERCENT', unit: 'percent', defaultValue: '10' },
  { value: 'PRICE_DROP_ABSOLUTE', unit: 'currency', defaultValue: '' },
  { value: 'LOWEST_EVER', unit: null, defaultValue: '0' },
  { value: 'MAJOR_DISCOUNT', unit: 'percent', defaultValue: '15' },
  { value: 'RESTOCK', unit: null, defaultValue: '0' },
  { value: 'PRICE_INCREASE', unit: 'percent', defaultValue: '10' },
];

export function AlertModal() {
  const { t, tf } = useI18n();
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
    !thresholdRequired ||
    (Number.isFinite(parsedThreshold) && parsedThreshold > 0 && (selected.unit !== 'percent' || parsedThreshold <= 95));

  return (
    <Dialog
      open={Boolean(productId)}
      onClose={closeAlertModal}
      variant="sheet"
      title={t.alerts.modalTitle}
      description={t.alerts.modalLede}
      footer={
        <>
          <Button variant="ghost" onClick={closeAlertModal}>
            {t.common.cancel}
          </Button>
          <Button
            leftIcon={<Bell className="h-4 w-4" aria-hidden />}
            loading={isPending}
            disabled={atLimit || !thresholdValid}
            onClick={() =>
              productId &&
              createAlert(
                { productId, alertType: type, thresholdValue: thresholdRequired ? parsedThreshold : 0, repeatable },
                { onSuccess: closeAlertModal },
              )
            }
          >
            {t.alerts.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {atLimit && (
          <p className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-fg">
            {tf(t.alerts.atLimit, { limit: alertLimit ?? 0 })}{' '}
            <Link href="/pricing" className="font-medium text-brand-text underline">
              {t.alerts.upgradeForMore}
            </Link>
          </p>
        )}

        <fieldset className="grid gap-2">
          <legend className="sr-only">{t.alerts.typeLegend}</legend>
          {ALERT_TYPES.map((item) => {
            const locked = !allowedTypes.includes(item.value);
            const copy = t.alerts.types[item.value];
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setType(item.value);
                  setThresholdValue(item.defaultValue);
                }}
                aria-pressed={type === item.value}
                disabled={locked}
                className={cn(
                  'flex flex-col gap-1 rounded border px-4 py-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  type === item.value ? 'border-brand bg-brand-soft/60' : 'border-border hover:border-border-strong',
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-fg">{copy.label}</span>
                  {locked && <Lock className="h-4 w-4 shrink-0 text-muted" aria-label={t.alerts.locked} />}
                </span>
                <span className="text-xs text-muted">{copy.hint}</span>
              </button>
            );
          })}
        </fieldset>

        {allowedTypes.length < ALERT_TYPES.length && (
          <Link href="/pricing" className="text-xs text-brand-text hover:underline">
            {t.alerts.plusUnlocks}
          </Link>
        )}

        {thresholdRequired && (
          <Input
            label={selected.unit === 'percent' ? t.alerts.percentage : tf(t.alerts.amount, { currency })}
            type="number"
            inputMode="decimal"
            dir="ltr"
            min="0"
            max={selected.unit === 'percent' ? '95' : undefined}
            step={selected.unit === 'percent' ? '1' : '0.01'}
            value={thresholdValue}
            onChange={(event) => setThresholdValue(event.target.value)}
            hint={
              selected.value === 'PRICE_TARGET'
                ? tf(t.alerts.targetHint, { currency })
                : selected.unit === 'percent'
                  ? t.alerts.percentHint
                  : tf(t.alerts.amountHint, { currency })
            }
          />
        )}

        <Checkbox
          checked={repeatable}
          onChange={(event) => setRepeatable(event.target.checked)}
          label={t.alerts.repeatLabel}
          description={t.alerts.repeatHint}
        />
      </div>
    </Dialog>
  );
}
