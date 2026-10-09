'use client';
import { useEffect, type ComponentType } from 'react';
import { Bell, LogOut, Shield, Tag, User } from 'lucide-react';
import { buttonClassName } from '@/components/ui/button-styles';
import { SearchBar } from '@/components/search/search-bar';
import { useAuthStore } from '@/lib/store/auth.store';
import { useUnreadCount } from '@/lib/hooks/use-notifications';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { LocaleSwitch } from './locale-switch';
import { ThemeToggle } from './theme-toggle';

type NavLink = { href: string; label: string; Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> };

// 48 px rows: the phone menu is all touch targets.
const row =
  'flex min-h-12 w-full items-center gap-3 rounded px-2 text-start text-base text-fg hover:bg-surface-2 aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-soft-fg';
const rowIcon = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-brand-text';

/**
 * The phone menu: a full-height sheet under the header. Signed-in people get
 * who they are, their three everyday destinations as large tiles, then the
 * tools as a list; settings and sign-out sit together at the bottom.
 */
export function MobileMenu({
  primary,
  tools,
  showSearch,
  onSearch,
  onClose,
  onLogout,
}: {
  primary: NavLink[];
  tools: NavLink[];
  showSearch: boolean;
  onSearch: (q: string) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t, tp } = useI18n();
  const pathname = usePathname();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const { data: unread = 0 } = useUnreadCount();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  const name = user?.displayName || user?.username || '';
  const current = (href: string) => (pathname.startsWith(href) ? 'page' : undefined);

  // The page behind must not scroll under the sheet; Escape closes it.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const tiles: (NavLink & { badge?: number; ariaLabel?: string })[] = [
    ...primary,
    {
      href: '/notifications',
      label: t.nav.alerts,
      Icon: Bell,
      badge: unread,
      ariaLabel: unread > 0 ? tp(t.nav.alertsUnread, unread) : undefined,
    },
  ];
  const toolRows = [...tools, ...(isAdmin ? [{ href: '/admin', label: t.nav.admin, Icon: Shield }] : [])];

  return (
    // Hangs from the sticky header and fills the rest of the screen.
    <div
      id="mobile-menu"
      className="absolute inset-x-0 top-full flex h-page animate-enter flex-col border-t border-border bg-bg lg:hidden"
    >
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        {showSearch && <SearchBar onSearch={onSearch} className="md:hidden" />}

        <nav aria-label={t.nav.mobile} className="flex flex-col gap-6">
          {!hasHydrated ? null : isAuthenticated ? (
            <>
              <Link
                href="/account/billing"
                onClick={onClose}
                aria-current={current('/account')}
                className="flex items-center gap-3 rounded-md border border-border bg-surface p-3 hover:border-border-strong aria-[current=page]:border-brand"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-semibold uppercase text-brand-fg"
                >
                  {name.slice(0, 1)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span dir="auto" className="truncate text-base font-medium text-fg">
                    {name}
                  </span>
                  <span className="text-sm text-muted">{t.nav.account}</span>
                </span>
              </Link>

              <ul className="grid grid-cols-3 gap-2">
                {tiles.map(({ href, label, Icon, badge, ariaLabel }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onClose}
                      aria-label={ariaLabel}
                      aria-current={current(href)}
                      className="relative flex h-24 flex-col justify-between rounded-md bg-brand-soft p-3 text-brand-soft-fg hover:bg-brand-soft/70 aria-[current=page]:bg-brand aria-[current=page]:text-brand-fg"
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="text-sm font-medium leading-tight">{label}</span>
                      {badge ? (
                        <span
                          aria-hidden
                          className="absolute end-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold tabular-nums text-accent-fg"
                        >
                          {badge > 9 ? '9+' : badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>

              {toolRows.length > 0 && (
                <section aria-labelledby="mobile-menu-tools" className="flex flex-col gap-1">
                  <h2 id="mobile-menu-tools" className="px-2 pb-1 text-sm font-medium text-muted">
                    {t.nav.tools}
                  </h2>
                  {toolRows.map(({ href, label, Icon }) => (
                    <Link key={href} href={href} onClick={onClose} aria-current={current(href)} className={row}>
                      <span className={rowIcon}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      {label}
                    </Link>
                  ))}
                </section>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Link href="/pricing" onClick={onClose} aria-current={current('/pricing')} className={row}>
                <span className={rowIcon}>
                  <Tag className="h-4 w-4" aria-hidden />
                </span>
                {t.nav.pricing}
              </Link>
              <Link href="/login" onClick={onClose} aria-current={current('/login')} className={row}>
                <span className={rowIcon}>
                  <User className="h-4 w-4" aria-hidden />
                </span>
                {t.common.signIn}
              </Link>
              <Link
                href="/register"
                onClick={onClose}
                className={buttonClassName({ variant: 'primary', size: 'lg', className: 'mt-3 w-full' })}
              >
                {t.common.getStarted}
              </Link>
            </div>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-2">
        <LocaleSwitch className="-ms-3" />
        <ThemeToggle />
        {hasHydrated && isAuthenticated && (
          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), 'ms-auto -me-3 text-danger hover:text-danger')}
          >
            <LogOut className="flip-rtl h-4 w-4" aria-hidden /> {t.common.signOut}
          </button>
        )}
      </div>
    </div>
  );
}
