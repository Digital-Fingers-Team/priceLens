'use client';
import { Link } from '@/lib/i18n/navigation';
import { useEffect } from 'react';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { LayoutDashboard, ClipboardList, BarChart3, Wallet, Tags, ToggleRight } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth.store';
import { loginHref } from '@/lib/utils/next-path';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/review', label: 'Review Queue', icon: ClipboardList },
  { href: '/admin/payments', label: 'Payments', icon: Wallet },
  { href: '/admin/plans', label: 'Plans', icon: Tags, adminOnly: true },
  { href: '/admin/flags', label: 'Feature flags', icon: ToggleRight, adminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, hasHydrated } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'MODERATOR')) {
      router.replace(loginHref('/admin'));
    }
  }, [hasHydrated, isAuthenticated, router, user?.role]);

  if (!hasHydrated) {
    return null;
  }

  if (!isAuthenticated || (user?.role !== 'ADMIN' && user?.role !== 'MODERATOR')) {
    return null;
  }

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
        {/* Sidebar */}
        <aside className="w-full lg:w-48 shrink-0 space-y-1 lg:sticky lg:top-24">
          <p className="label-mono text-muted px-3 mb-3">
            Admin Panel
          </p>
          {NAV.filter((item) => !('adminOnly' in item) || user?.role === 'ADMIN').map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-soft text-brand border border-brand/20'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {label}
              </Link>
            );
          })}

          {/* Role badge */}
          <div className="pt-4 px-3">
            <span className="text-xs text-muted">
              Signed in as{' '}
              <span className="text-fg font-medium">{user?.role}</span>
            </span>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
