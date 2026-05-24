'use client';
import { useState } from 'react';
import { RefreshCw, Search, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/lib/store/ui.store';
import { adminApi } from '@/lib/api/admin.api';

export function QuickActions() {
  const [scrapeQuery, setScrapeQuery] = useState('');
  const [isReindexing, setIsReindexing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
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

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    if (!scrapeQuery.trim()) return;
    setIsScraping(true);
    try {
      await adminApi.triggerScrape(scrapeQuery.trim());
      addToast(`Scraping started for "${scrapeQuery}"`, 'success');
      setScrapeQuery('');
    } catch {
      addToast('Scrape trigger failed', 'error');
    } finally {
      setIsScraping(false);
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

        {/* Trigger scrape */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Scrape Query
          </p>
          <form onSubmit={handleScrape} className="flex gap-2">
            <Input
              value={scrapeQuery}
              onChange={(e) => setScrapeQuery(e.target.value)}
              placeholder="RTX 4090, iPhone 15…"
              leftIcon={<Search className="w-3.5 h-3.5" />}
              className="h-9 text-xs"
            />
            <Button type="submit" variant="primary" size="sm" loading={isScraping}>
              Go
            </Button>
          </form>
        </div>

        {/* Rematch */}
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

        {/* Reindex */}
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