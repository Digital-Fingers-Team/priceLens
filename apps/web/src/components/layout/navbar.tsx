'use client';
import { useState } from 'react';
import { Heart, User, LogOut, Shield, Menu, X, Sparkles, Building2, Bell, Tag, ShoppingBasket, MessageCircleQuestion, Ship } from 'lucide-react';
import { LensMark, Wordmark } from '@/components/brand/logo';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Button, IconButton } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { SearchBar } from '@/components/search/search-bar';
import { useAuthStore } from '@/lib/store/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { Link, usePathname, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useFlags } from '@/lib/hooks/use-billing';
import { LocaleSwitch } from './locale-switch';
import { ThemeToggle } from './theme-toggle';

// 44 px rows: the phone menu is all touch targets.
const mobileItem = 'flex min-h-11 w-full items-center gap-3 rounded px-3 text-start text-sm text-fg hover:bg-surface-2';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  // The /search page already renders its own SearchBar plus the query summary
  // and filters — showing this one too would put two search boxes on screen.
  const onSearchPage = pathname.startsWith('/search');
  const close = () => setMobileOpen(false);

  function handleMobileSearch(q: string) {
    router.push(`/search?q=${encodeURIComponent(q)}`);
    close();
  }

  const flags = useFlags();
  const memberLinks = [
    { href: '/watchlist', label: t.nav.watchlist, Icon: Heart },
    ...(flags.isOn('cart_watch') ? [{ href: '/cart-watch', label: t.nav.baskets, Icon: ShoppingBasket }] : []),
    { href: '/deal-hunter', label: t.nav.dealHunter, Icon: Sparkles },
    ...(flags.isOn('advisor') ? [{ href: '/advisor', label: t.nav.advisor, Icon: MessageCircleQuestion }] : []),
    { href: '/seller', label: t.nav.seller, Icon: Building2 },
    ...(['import_finder', 'fx_tracking', 'trend_radar'].some((flag) => flags.isOn(flag))
      ? [{ href: '/importers', label: t.nav.importers, Icon: Ship }]
      : []),
  ];

  return (
    <header className="glass sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center text-brand" aria-label={t.nav.home}>
          {/* The wordmark needs room the phone header does not have, so the
              lens mark alone stands in below sm. */}
          <LensMark className="h-8 w-auto sm:hidden" />
          <Wordmark className="hidden h-7 w-auto sm:block" />
        </Link>

        {!onSearchPage && <SearchBar className="hidden max-w-xl flex-1 md:flex" />}

        <nav aria-label={t.nav.main} className="hidden items-center gap-1 md:flex">
          {/* Signed-in state is only known after the stored session is read
              on the client; showing the guest links first would flash
              "Sign in" at people who are signed in. */}
          {!hasHydrated ? null : isAuthenticated ? (
            <>
              {memberLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname.startsWith(href) ? 'page' : undefined}
                  className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'aria-[current=page]:text-fg' })}
                >
                  {label}
                </Link>
              ))}
              <NotificationBell />
              {isAdmin && (
                <Link href="/admin" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  {t.nav.admin}
                </Link>
              )}
              <span className="mx-1 h-6 w-px bg-border" aria-hidden />
              <Link
                href="/account/billing"
                className="max-w-40 truncate px-2 text-sm text-muted transition-colors hover:text-fg"
                dir="auto"
              >
                {user?.displayName ?? user?.username}
              </Link>
              <Button variant="ghost" size="sm" loading={loggingOut} onClick={() => logout()}>
                {t.common.signOut}
              </Button>
            </>
          ) : (
            <>
              <Link href="/pricing" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                {t.nav.pricing}
              </Link>
              <Link href="/login" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                {t.common.signIn}
              </Link>
              <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
                {t.common.getStarted}
              </Link>
            </>
          )}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <LocaleSwitch />
          <ThemeToggle />
        </nav>

        <IconButton
          className="-me-2 md:hidden"
          aria-label={mobileOpen ? t.nav.closeMenu : t.nav.openMenu}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </IconButton>
      </div>

      {mobileOpen && (
        <div id="mobile-menu" className="flex flex-col gap-4 border-t border-border px-4 py-4 md:hidden">
          {!onSearchPage && <SearchBar onSearch={handleMobileSearch} />}

          <nav aria-label={t.nav.mobile} className="flex flex-col gap-1">
            {/* Same destinations as the desktop bar (audit 06, U-10). */}
            {!hasHydrated ? null : isAuthenticated ? (
              <>
                {[
                  ...memberLinks,
                  { href: '/notifications', label: t.nav.notifications, Icon: Bell },
                  { href: '/account/billing', label: t.nav.account, Icon: User },
                  ...(isAdmin ? [{ href: '/admin', label: t.nav.admin, Icon: Shield }] : []),
                ].map(({ href, label, Icon }) => (
                  <Link key={href} href={href} onClick={close} className={mobileItem}>
                    <Icon className="h-4 w-4 text-muted" aria-hidden /> {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    close();
                  }}
                  className={mobileItem}
                >
                  <LogOut className="flip-rtl h-4 w-4 text-muted" aria-hidden /> {t.common.signOut}
                </button>
              </>
            ) : (
              <>
                <Link href="/pricing" onClick={close} className={mobileItem}>
                  <Tag className="h-4 w-4 text-muted" aria-hidden /> {t.nav.pricing}
                </Link>
                <Link href="/login" onClick={close} className={mobileItem}>
                  <User className="h-4 w-4 text-muted" aria-hidden /> {t.common.signIn}
                </Link>
                <Link
                  href="/register"
                  onClick={close}
                  className={buttonClassName({ variant: 'primary', size: 'lg', className: 'mt-2 w-full' })}
                >
                  {t.common.getStarted}
                </Link>
              </>
            )}
          </nav>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <LocaleSwitch className="-ms-3" />
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
