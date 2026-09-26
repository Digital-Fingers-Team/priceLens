'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/** The show/hide button inside a password field. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-8 w-8 items-center justify-center rounded-sm text-muted transition-colors hover:text-fg"
      aria-label={shown ? t.auth.hidePassword : t.auth.showPassword}
      aria-pressed={shown}
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
