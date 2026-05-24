'use client';
import { useUiStore, type ToastVariant } from '@/lib/store/ui.store';
import { cn } from '@/lib/utils/cn';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
  error:   <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
  info:    <Info className="w-4 h-4 text-blue-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
};

const borders: Record<ToastVariant, string> = {
  success: 'border-emerald-500/30',
  error:   'border-red-500/30',
  info:    'border-blue-500/30',
  warning: 'border-amber-500/30',
};

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-xl',
            'bg-ink-800 border shadow-2xl animate-fade-up',
            borders[toast.variant],
          )}
        >
          {icons[toast.variant]}
          <p className="text-sm text-ink-200 flex-1 leading-relaxed">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-ink-500 hover:text-ink-200 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}