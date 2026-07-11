'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, User, LogOut, Shield, Menu, X, TrendingUp } from 'lucide-react';
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
            className="flex items-center gap-2 shrink-0 group"
          >
            <div className="w-8 h-8 rounded-lg bg-signal flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-ink-950" />
            </div>
            <span className="font-bold text-ink-50 text-lg tracking-tight hidden sm:block">
              Price<span className="text-signal">Lens</span>
            </span>
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

                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" leftIcon={<Shield className="w-4 h-4" />}>
                      Admin
                    </Button>
                  </Link>
                )}

                <div className="w-px h-6 bg-ink-700 mx-1" />

                <span className="text-sm text-ink-400 px-2">
                  {user?.displayName ?? user?.username}
                </span>

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
