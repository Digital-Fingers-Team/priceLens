'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { downloadFile } from '@/lib/api/business.api';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';

/** Locked / hidden / loading states shared by every business section. */
export function Gate({ feature, title, children }: { feature: string; title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const access = useEntitlement(feature);
  if (access === 'loading') return <Skeleton className="h-48 w-full" />;
  if (access === 'hidden') return <EmptyState title={t.business.unavailable} />;
  if (access === 'locked') return <UpgradePrompt title={title} description={t.business.lockedBody} />;
  return <>{children}</>;
}

/** A button that downloads a file the API builds (CSV or PDF). */
export function DownloadButton({ path, filename, label }: { path: string; filename: string; label: string }) {
  const addToast = useUiStore((s) => s.addToast);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      leftIcon={<Download className="h-4 w-4" aria-hidden />}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(path, filename);
        } catch {
          addToast(t.toast.saveFailed, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
