'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/state';
import { useI18n } from '@/lib/i18n/provider';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-page max-w-page items-center justify-center px-4">
      <ErrorState
        icon={<AlertTriangle className="h-5 w-5" />}
        title={t.errors.genericTitle}
        description={t.errors.genericBody}
        action={<Button onClick={reset}>{t.common.retry}</Button>}
      />
    </div>
  );
}
