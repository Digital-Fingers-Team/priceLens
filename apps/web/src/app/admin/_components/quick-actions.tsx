'use client';
import { useState } from 'react';
import { DatabaseZap, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/store/ui.store';
import { adminApi } from '@/lib/api/admin.api';
import { getApiErrorMessage } from '@/lib/utils/api-error';

export function QuickActions() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const addToast = useUiStore((s) => s.addToast);

  async function handleLiveSync() {
    setIsSyncing(true);
    try {
      await adminApi.triggerLiveIngestion(['jumia', 'carrefour', 'alibaba'], 25);
      addToast('Live sync queued — this runs in the background and can take a few minutes', 'success');
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Live sync failed to queue'), 'error');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRematch() {
    setIsRematching(true);
    try {
      await adminApi.triggerReconcile(100);
      addToast('Reconciliation queued — this runs in the background', 'success');
    } catch (err) {
      addToast(getApiErrorMessage(err, 'Failed to queue reconciliation'), 'error');
    } finally {
      setIsRematching(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-700">
        <h2 className="font-semibold text-ink-100 text-sm">Quick Actions</h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Live Store Sync
          </p>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            loading={isSyncing}
            leftIcon={<DatabaseZap className="w-4 h-4" />}
            onClick={handleLiveSync}
          >
            Sync live catalog
          </Button>
          <p className="text-[11px] text-ink-500">
            Pulls real listings from Jumia, Carrefour, and Alibaba and upserts them into the catalog.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Re-run Matching
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={isRematching}
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={handleRematch}
          >
            Reconcile duplicates (100)
          </Button>
        </div>

      </div>
    </div>
  );
}
