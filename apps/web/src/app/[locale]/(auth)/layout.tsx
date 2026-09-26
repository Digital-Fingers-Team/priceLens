'use client';
import { Wordmark } from '@/components/brand/logo';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-page items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" aria-label={t.nav.home} className="self-center text-brand">
          <Wordmark className="h-8 w-auto" />
        </Link>
        <div className="rounded border border-border bg-surface p-6">{children}</div>
      </div>
    </div>
  );
}
