'use client';
import { buttonClassName } from '@/components/ui/button-styles';
import { EmptyState } from '@/components/ui/state';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { loginHref } from '@/lib/utils/next-path';

/**
 * Account pages: nothing until the stored session is read ("signed out" is
 * not known before that), a sign-in prompt when signed out.
 */
export function SignedInGate({ path, prompt, children }: { path: string; prompt: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  if (!hasHydrated) return <div className="mx-auto max-w-3xl px-4 py-12" aria-busy="true" />;
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          title={prompt}
          action={
            <Link href={loginHref(path)} className={buttonClassName()}>
              {t.common.signIn}
            </Link>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
