'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ClipboardList } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth.store';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/review', label: 'Review Queue', icon: ClipboardList },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'MODERATOR')) {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, router, user?.role]);

  if (!hasHydrated) {
    return null;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'MODERATOR')) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex gap-8 items-start">
        {/* Sidebar */}
        <aside className="w-48 shrink-0 space-y-1 sticky top-24">
          <p className="text-[10px] font-bold text-ink-600 uppercase tracking-widest px-3 mb-3">
            Admin Panel
          </p>
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-signal/10 text-signal border border-signal/20'
                    : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}

          {/* Role badge */}
          <div className="pt-4 px-3">
            <span className="text-xs text-ink-600">
              Signed in as{' '}
              <span className="text-ink-400 font-medium">{user?.role}</span>
            </span>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
