'use client';
import { useCallback, useState } from 'react';
import { Heart, User, LogOut, Shield, Menu as MenuIcon, X, Sparkles, Building2, Bell, ShoppingBasket, MessageCircleQuestion, Ship, Briefcase } from 'lucide-react';
import { LensMark, Wordmark } from '@/components/brand/logo';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { IconButton } from '@/components/ui/button';
import { Menu, menuItemClass } from '@/components/ui/menu';
import { buttonClassName } from '@/components/ui/button-styles';
import { SearchBar } from '@/components/search/search-bar';
import { useAuthStore } from '@/lib/store/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { Link, usePathname, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useFlags } from '@/lib/hooks/use-billing';
import { LocaleSwitch } from './locale-switch';
import { ThemeToggle } from './theme-toggle';
import { MobileMenu } from './mobile-menu';

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
  const close = useCallback(() => setMobileOpen(false), []);

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
    ...(flags.isOn('map_monitoring') ? [{ href: '/business', label: t.nav.business, Icon: Briefcase }] : []),
  ];
  const PRIMARY = ['/watchlist', '/deal-hunter'];
  const primaryLinks = memberLinks.filter(({ href }) => PRIMARY.includes(href));
  const toolLinks = memberLinks.filter(({ href }) => !PRIMARY.includes(href));

  return (
    <header className="glass sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center text-brand-text" aria-label={t.nav.home}>
          {/* The wordmark needs room the phone header does not have, so the
              lens mark alone stands in below sm. */}
          <LensMark className="h-8 w-auto sm:hidden" />
          <Wordmark className="hidden h-7 w-auto sm:block" />
        </Link>

        {!onSearchPage && <SearchBar className="hidden max-w-xl flex-1 md:flex" />}

        <nav aria-label={t.nav.main} className="hidden shrink-0 items-center gap-1 lg:flex">
          {/* Signed-in state is only known after the stored session is read
              on the client; showing the guest links first would flash
              "Sign in" at people who are signed in. */}
          {!hasHydrated ? null : isAuthenticated ? (
            <>
              {/* Two destinations inline, the rest under Tools and the account
                  menu, so the bar stays on one line at every desktop width. */}
              {primaryLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname.startsWith(href) ? 'page' : undefined}
                  className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'aria-[current=page]:text-fg' })}
                >
                  {label}
                </Link>
              ))}
              {toolLinks.length > 0 && (
                <Menu label={t.nav.tools}>
                  {(closeMenu) =>
                    toolLinks.map(({ href, label, Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={closeMenu}
                        aria-current={pathname.startsWith(href) ? 'page' : undefined}
                        className={menuItemClass}
                      >
                        <Icon className="h-4 w-4 text-muted" aria-hidden /> {label}
                      </Link>
                    ))
                  }
                </Menu>
              )}
              <NotificationBell />
              <span className="mx-1 h-6 w-px bg-border" aria-hidden />
              <Menu label={<span dir="auto">{user?.displayName ?? user?.username}</span>} icon={<User className="h-4 w-4" aria-hidden />}>
                {(closeMenu) => (
                  <>
                    <Link href="/account/billing" onClick={closeMenu} className={menuItemClass}>
                      <User className="h-4 w-4 text-muted" aria-hidden /> {t.nav.account}
                    </Link>
                    <Link href="/notifications" onClick={closeMenu} className={menuItemClass}>
                      <Bell className="h-4 w-4 text-muted" aria-hidden /> {t.nav.notifications}
                    </Link>
                    {isAdmin && (
                      <Link href="/admin" onClick={closeMenu} className={menuItemClass}>
                        <Shield className="h-4 w-4 text-muted" aria-hidden /> {t.nav.admin}
                      </Link>
                    )}
                    <span className="my-1 h-px bg-border" aria-hidden />
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() => {
                        closeMenu();
                        logout();
                      }}
                      className={menuItemClass}
                    >
                      <LogOut className="flip-rtl h-4 w-4 text-muted" aria-hidden /> {t.common.signOut}
                    </button>
                  </>
                )}
              </Menu>
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
          className="-me-2 lg:hidden"
          aria-label={mobileOpen ? t.nav.closeMenu : t.nav.openMenu}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <MenuIcon className="h-5 w-5" aria-hidden />}
        </IconButton>
      </div>

      {mobileOpen && (
        <MobileMenu
          primary={primaryLinks}
          tools={toolLinks}
          showSearch={!onSearchPage}
          onSearch={handleMobileSearch}
          onClose={close}
          onLogout={logout}
        />
      )}
    </header>
  );
}
