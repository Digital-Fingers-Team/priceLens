'use client';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore, type ToastVariant } from '@/lib/store/ui.store';
import { cn } from '@/lib/utils/cn';

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />,
  error: <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0 text-info" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />,
};

/** Bottom end corner (right in LTR, left in RTL); announced politely. */
export function ToastContainer() {
  const { t } = useI18n();
  const { toasts, removeToast } = useUiStore();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-96"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex animate-enter items-start gap-3 rounded border border-border bg-surface px-4 py-3 shadow',
            toast.variant === 'error' && 'border-danger/40',
          )}
        >
          {icons[toast.variant]}
          <p className="flex-1 text-sm text-fg">{toast.message}</p>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            aria-label={t.common.dismiss}
            className="-m-1 shrink-0 rounded-sm p-1 text-muted transition-colors hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
