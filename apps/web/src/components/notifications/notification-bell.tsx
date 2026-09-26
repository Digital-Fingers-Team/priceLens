'use client';

import { Bell } from 'lucide-react';
import { iconButtonClassName } from '@/components/ui/button-styles';
import { useUnreadCount } from '@/lib/hooks/use-notifications';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

/**
 * Navbar entry point to the alert inbox.
 *
 * Renders the bell whether or not there is anything unread — a control that
 * appears only when it has something to say is a control users never learn
 * exists.
 */
export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const { t, tp } = useI18n();
  const { data: count = 0 } = useUnreadCount();

  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      aria-label={count > 0 ? tp(t.nav.alertsUnread, count) : t.nav.alerts}
      className={iconButtonClassName({ className: 'relative' })}
    >
      <Bell className="h-4 w-4" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 font-sans text-xs font-semibold normal-case tabular-nums tracking-normal text-brand-fg"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
