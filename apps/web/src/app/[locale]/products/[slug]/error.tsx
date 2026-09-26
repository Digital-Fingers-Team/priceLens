'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { ErrorState } from '@/components/ui/state';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error('Product page error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-page px-4 py-16 sm:px-6">
      <ErrorState
        icon={<AlertTriangle className="h-5 w-5" />}
        title={t.errors.genericTitle}
        description={t.product.unavailableBody}
        action={
          <>
            <Button onClick={reset}>{t.common.retry}</Button>
            <Link href="/search" className={buttonClassName({ variant: 'secondary' })}>
              {t.product.browseAll}
            </Link>
          </>
        }
      />
    </div>
  );
}
