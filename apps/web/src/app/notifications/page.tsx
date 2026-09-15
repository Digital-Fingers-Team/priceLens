'use client';

import Link from 'next/link';
import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/hooks/use-notifications';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';

export default function NotificationsPage() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { data, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllNotificationsRead();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-ink-400">
          <Link href="/login" className="text-signal hover:underline">
            Sign in
          </Link>{' '}
          to see your alerts.
        </p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const hasUnread = items.some((item) => !item.readAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-50">Alerts</h1>
          <p className="mt-1 text-sm text-ink-400">Everything PriceLens has told you.</p>
        </div>
        {hasUnread && (
          <Button
            variant="ghost"
            leftIcon={<CheckCheck className="h-4 w-4" />}
            loading={markingAll}
            onClick={() => markAllRead()}
          >
            Mark all read
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/50 px-6 py-12 text-center">
          <BellOff className="mx-auto h-6 w-6 text-ink-600" aria-hidden />
          <h2 className="mt-3 text-sm font-medium text-ink-300">No alerts yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
            Track a product and set a target price — we will tell you the moment it gets there.
          </p>
          <Link href="/search" className="mt-4 inline-block text-sm text-signal hover:underline">
            Find something to track
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const unread = !item.readAt;
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2 className={cn('text-sm font-semibold', unread ? 'text-ink-50' : 'text-ink-300')}>
                    {item.title}
                  </h2>
                  {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal" aria-label="Unread" />}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-400">{item.body}</p>
                <time className="mt-2 block text-xs text-ink-600" dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </>
            );

            return (
              <li key={item.id}>
                {item.url ? (
                  <Link
                    href={new URL(item.url, 'http://x').pathname}
                    onClick={() => unread && markRead(item.id)}
                    className={cn(
                      'block rounded-xl border p-4 transition-colors',
                      unread ? 'border-ink-600 bg-ink-900' : 'border-ink-800 bg-ink-900/50',
                      'hover:border-ink-500',
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    className={cn(
                      'rounded-xl border p-4',
                      unread ? 'border-ink-600 bg-ink-900' : 'border-ink-800 bg-ink-900/50',
                    )}
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
