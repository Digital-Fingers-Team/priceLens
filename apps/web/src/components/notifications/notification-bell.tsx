'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/lib/hooks/use-notifications';

/**
 * Navbar entry point to the alert inbox.
 *
 * Renders the bell whether or not there is anything unread — a control that
 * appears only when it has something to say is a control users never learn
 * exists.
 */
export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const { data: count = 0 } = useUnreadCount();

  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      aria-label={count > 0 ? `Alerts, ${count} unread` : 'Alerts'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
    >
      <Bell className="h-4 w-4" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-[0.625rem] font-bold tabular-nums text-ink-950"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
