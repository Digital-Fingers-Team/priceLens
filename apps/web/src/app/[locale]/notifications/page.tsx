'use client';

import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/hooks/use-notifications';
import { intlLocale } from '@/lib/i18n/config';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';
import { loginHref } from '@/lib/utils/next-path';

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const { data, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllNotificationsRead();

  // Until the stored session is read, "signed out" is not known yet.
  if (!hasHydrated) return <div className="mx-auto max-w-3xl px-4 py-12" aria-busy="true" />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          title={t.notifications.signInTitle}
          action={
            <Link href={loginHref('/notifications')} className={buttonClassName()}>
              {t.common.signIn}
            </Link>
          }
        />
      </div>
    );
  }

  const items = data?.items ?? [];
  const hasUnread = items.some((item) => !item.readAt);
  const dateTime = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg">{t.nav.alerts}</h1>
          <p className="text-sm text-muted">{t.notifications.lede}</p>
        </div>
        {hasUnread && (
          <Button variant="ghost" size="sm" leftIcon={<CheckCheck className="h-4 w-4" aria-hidden />} loading={markingAll} onClick={() => markAllRead()}>
            {t.notifications.markAllRead}
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-5 w-5" />}
          title={t.notifications.emptyTitle}
          description={t.notifications.emptyBody}
          action={
            <Link href="/search" className={buttonClassName({ variant: 'secondary' })}>
              {t.notifications.findSomething}
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded border border-border bg-surface">
          {items.map((item) => {
            const unread = !item.readAt;
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2 dir="auto" className={cn('text-sm', unread ? 'font-semibold text-fg' : 'font-medium text-muted')}>
                    {item.title}
                  </h2>
                  {unread && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" role="img" aria-label={t.notifications.unread} />
                  )}
                </div>
                <p dir="auto" className="text-sm text-muted">
                  {item.body}
                </p>
                <time className="text-xs text-muted" dateTime={item.createdAt}>
                  {dateTime.format(new Date(item.createdAt))}
                </time>
              </>
            );
            const rowClass = cn('flex flex-col gap-1 p-4', unread && 'bg-brand-soft/30');
            return (
              <li key={item.id}>
                {item.url ? (
                  <Link
                    href={new URL(item.url, 'http://x').pathname}
                    onClick={() => unread && markRead(item.id)}
                    className={cn(rowClass, 'transition-colors hover:bg-surface-2')}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
