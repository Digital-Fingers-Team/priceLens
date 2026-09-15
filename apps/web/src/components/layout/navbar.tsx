'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, User, LogOut, Shield, Menu, X, TrendingUp, Sparkles, Building2 } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useAuthStore } from '@/lib/store/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search/search-bar';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
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
          <nav className="hidden md:flex items-center gap-1">
            {isAuthenticated ? (
              <>
                <Link href="/watchlist">
                  <Button variant="ghost" size="sm" leftIcon={<Heart className="w-4 h-4" />}>
                    Watchlist
                  </Button>
                </Link>
                <Link href="/deal-hunter">
                  <Button variant="ghost" size="sm" leftIcon={<Sparkles className="w-4 h-4" />}>
                    Deal Hunter
                  </Button>
                </Link>
                <Link href="/collections">
                  <Button variant="ghost" size="sm">
                    Collections
                  </Button>
                </Link>

                <Link href="/seller">
                  <Button variant="ghost" size="sm" leftIcon={<Building2 className="w-4 h-4" />}>
                    Seller
                  </Button>
                </Link>

                <NotificationBell />

                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" leftIcon={<Shield className="w-4 h-4" />}>
                      Admin
                    </Button>
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
                <Link href="/pricing">
                  <Button variant="ghost" size="sm" leftIcon={<Sparkles className="w-4 h-4" />}>
                    Pricing
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary" size="sm">Get started</Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-ink-300 hover:text-ink-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-ink-700 bg-ink-950 px-4 py-4 space-y-4">
          {!onSearchPage && <SearchBar onSearch={handleMobileSearch} />}

          <div className="flex flex-col gap-1">
            {isAuthenticated ? (
              <>
                <Link href="/watchlist" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-ink-200 hover:bg-ink-800 text-sm">
                  <Heart className="w-4 h-4" /> Watchlist
                </Link>
                <Link href="/collections" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-ink-200 hover:bg-ink-800 text-sm">
                  <TrendingUp className="w-4 h-4" /> Collections
                </Link>
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-ink-200 hover:bg-ink-800 text-sm">
                    <Shield className="w-4 h-4" /> Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-ink-200 hover:bg-ink-800 text-sm text-left"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-ink-200 hover:bg-ink-800 text-sm">
                  <User className="w-4 h-4" /> Sign in
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" size="sm" className="w-full">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
