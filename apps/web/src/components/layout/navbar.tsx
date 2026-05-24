'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Search, Heart, User, LogOut, Shield, Menu, X, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchQuery('');
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
          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-xl"
          >
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, brands, models…"
                className={cn(
                  'w-full h-10 pl-9 pr-4 rounded-lg text-sm',
                  'bg-ink-800 border border-ink-600',
                  'text-ink-100 placeholder:text-ink-500',
                  'focus:outline-none focus:border-signal/50 focus:ring-1 focus:ring-signal/20',
                  'transition-colors duration-150',
                )}
              />
            </div>
          </form>

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
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full h-10 pl-9 pr-4 rounded-lg text-sm bg-ink-800 border border-ink-600 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-signal/50"
            />
          </form>

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