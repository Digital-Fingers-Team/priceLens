'use client';
import { useState } from 'react';
import { DatabaseZap, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/store/ui.store';
import { adminApi } from '@/lib/api/admin.api';

export function QuickActions() {
  const [isReindexing, setIsReindexing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const addToast = useUiStore((s) => s.addToast);

  async function handleReindex() {
    setIsReindexing(true);
    try {
      await fetch('/api/search/reindex', { method: 'POST' });
      addToast('Search index rebuild started', 'success');
    } catch {
      addToast('Reindex failed', 'error');
    } finally {
      setIsReindexing(false);
    }
  }

  async function handleLiveSync() {
    setIsSyncing(true);
    try {
      const report = await adminApi.triggerLiveIngestion(['bestbuy'], 25);
      const summary = report.platforms[0];
      if (summary) {
        addToast(
          `Live sync finished: ${summary.listingsUpserted} listings from ${summary.platformName}`,
          'success',
        );
      } else {
        addToast('Live sync finished with no listings returned', 'info');
      }
    } catch {
      addToast('Live sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRematch() {
    setIsRematching(true);
    try {
      const result = await adminApi.triggerRematch(100);
      addToast(`Rematched ${result.processed} listings`, 'success');
    } catch {
      addToast('Rematch failed', 'error');
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
            Sync Best Buy catalog
          </Button>
          <p className="text-[11px] text-ink-500">
            Pulls real listings from the live Best Buy API and upserts them into the catalog.
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
            Rematch outdated (100)
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Search Index
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={isReindexing}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={handleReindex}
          >
            Rebuild search index
          </Button>
        </div>
      </div>
    </div>
  );
}
