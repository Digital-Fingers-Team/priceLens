'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, User, LogOut, Shield, Menu, X, Sparkles, Building2, Bell } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuthStore } from '@/lib/store/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { SearchBar } from '@/components/search/search-bar';

// 44 px rows: the phone menu is all touch targets.
const mobileItem =
  'flex min-h-11 w-full items-center gap-2 px-3 rounded-lg text-ink-200 hover:bg-ink-800 text-sm text-left';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
  // The /search page already renders its own SearchBar plus the query summary
  // and filters — showing this one too would put two search boxes on screen.
  const onSearchPage = pathname?.startsWith('/search');

  function handleMobileSearch(q: string) {
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center shrink-0 group"
            aria-label="Pricelens home"
          >
            {/* The wordmark needs room the phone header does not have, so the
                lens mark alone stands in below sm -- same asset family, so it
                still reads as the logo rather than a different icon. */}
            <Image
              src="/icon-512.png"
              alt=""
              width={512}
              height={512}
              priority
              className="h-8 w-8 sm:hidden"
            />
            <Image
              src="/logo-wordmark.png"
              alt="Pricelens"
              width={960}
              height={241}
              priority
              className="hidden sm:block h-7 w-auto"
            />
          </Link>

          {/* Desktop search */}
          {!onSearchPage && (
            <SearchBar className="hidden md:flex flex-1 max-w-xl" />
          )}

          {/* Desktop actions */}
          <nav aria-label="Main" className="hidden md:flex items-center gap-1">
            {/* Signed-in state is only known after the stored session is read
                on the client; showing the guest links first would flash
                "Sign in" at people who are signed in. */}
            {!hasHydrated ? null : isAuthenticated ? (
              <>
                <Link href="/watchlist" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  <Heart className="w-4 h-4" />
                  Watchlist
                </Link>
                <Link href="/deal-hunter" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  <Sparkles className="w-4 h-4" />
                  Deal Hunter
                </Link>

                <Link href="/seller" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  <Building2 className="w-4 h-4" />
                  Seller
                </Link>

                <NotificationBell />

                {isAdmin && (
                  <Link href="/admin" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                    <Shield className="w-4 h-4" />
                    Admin
                  </Link>
                )}

                <div className="w-px h-6 bg-ink-700 mx-1" />

                <Link href="/account/billing" className="px-2 text-sm text-ink-400 transition-colors hover:text-ink-100">
                  {user?.displayName ?? user?.username}
                </Link>

                <Button
                  variant="ghost"
                  size="sm"
                  loading={loggingOut}
                  leftIcon={<LogOut className="w-4 h-4" />}
                  onClick={() => logout()}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/pricing" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  <Sparkles className="w-4 h-4" />
                  Pricing
                </Link>
                <Link href="/login" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonClassName({ variant: 'primary', size: 'sm' })}>
                  Get started
                </Link>
              </>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="md:hidden -mr-2.5 p-2.5 text-ink-300 hover:text-ink-100 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-ink-700 bg-ink-950 px-4 py-4 space-y-4">
          {!onSearchPage && <SearchBar onSearch={handleMobileSearch} />}

          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {/* Same destinations as the desktop bar (audit 06, U-10). */}
            {!hasHydrated ? null : isAuthenticated ? (
              <>
                {[
                  { href: '/watchlist', label: 'Watchlist', Icon: Heart },
                  { href: '/deal-hunter', label: 'Deal Hunter', Icon: Sparkles },
                  { href: '/notifications', label: 'Notifications', Icon: Bell },
                  { href: '/seller', label: 'Seller', Icon: Building2 },
                  { href: '/account/billing', label: 'Account & plan', Icon: User },
                  ...(isAdmin ? [{ href: '/admin', label: 'Admin', Icon: Shield }] : []),
                ].map(({ href, label, Icon }) => (
                  <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={mobileItem}>
                    <Icon className="w-4 h-4" aria-hidden /> {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className={mobileItem}
                >
                  <LogOut className="w-4 h-4" aria-hidden /> Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/pricing" onClick={() => setMobileOpen(false)} className={mobileItem}>
                  <Sparkles className="w-4 h-4" aria-hidden /> Pricing
                </Link>
                <Link href="/login" onClick={() => setMobileOpen(false)} className={mobileItem}>
                  <User className="w-4 h-4" aria-hidden /> Sign in
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)} className={buttonClassName({ variant: 'primary', size: 'md', className: 'w-full mt-2' })}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
