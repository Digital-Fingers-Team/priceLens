'use client';
import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Check, X, Store } from 'lucide-react';
import type { ReviewQueueItem } from '@/types/admin.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatRelativeTime } from '@/lib/utils/format';
import { getConfidenceLevel, getConfidenceColor } from '@/lib/utils/price';
import { useResolveQueueItem } from '@/lib/hooks/use-admin';
import { cn } from '@/lib/utils/cn';

interface ReviewCardProps {
  item: ReviewQueueItem;
}

export function ReviewCard({ item }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const { mutate: resolve, isPending } = useResolveQueueItem();

  const confidenceLevel = getConfidenceLevel(item.confidence);
  const confidencePct = `${(item.confidence * 100).toFixed(1)}%`;

  const scoreEntries = Object.entries(item.scores);

  function handleResolve(decision: 'ACCEPT' | 'REJECT') {
    resolve({
      id: item.id,
      body: {
        decision,
        canonicalProductId: item.canonicalProductId ?? undefined,
        notes: notes.trim() || undefined,
      },
    });
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 overflow-hidden">
      {/* Header row */}
      <div className="p-4 flex items-start gap-4">
        {/* Confidence indicator */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black border-2',
            confidenceLevel === 'high' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
            confidenceLevel === 'medium' && 'border-amber-500/40 bg-amber-500/10 text-amber-400',
            confidenceLevel === 'low' && 'border-red-500/40 bg-red-500/10 text-red-400',
          )}>
            {(item.confidence * 100).toFixed(0)}
          </div>
          <span className="text-[9px] text-ink-500 uppercase tracking-wider font-semibold">
            conf. %
          </span>
        </div>

        {/* Source listing info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{item.sourceListing.platform.name}</Badge>
            <Badge
              variant={
                confidenceLevel === 'high' ? 'success'
                  : confidenceLevel === 'medium' ? 'warning'
                  : 'danger'
              }
            >
              {confidenceLevel} confidence
            </Badge>
            <span className="text-xs text-ink-500">{formatRelativeTime(item.createdAt)}</span>
          </div>

          <p className="text-sm font-semibold text-ink-100 line-clamp-1">
            {item.sourceListing.rawTitle}
          </p>

          {item.canonicalProduct && (
            <p className="text-xs text-ink-500 flex items-center gap-1">
              <Store className="w-3 h-3 shrink-0" />
              Candidate:{' '}
              <span className="text-ink-300 font-medium">{item.canonicalProduct.title}</span>
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-ink-400">
            {item.sourceListing.rawPrice != null && (
              <span className="font-semibold text-signal">
                {item.sourceListing.rawCurrency} {formatCurrency(item.sourceListing.rawPrice ?? undefined)}
              </span>
            )}
            <a
              href={item.sourceListing.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-signal transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View listing <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="danger"
            size="sm"
            loading={isPending}
            leftIcon={<X className="w-4 h-4" />}
            onClick={() => handleResolve('REJECT')}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isPending}
            leftIcon={<Check className="w-4 h-4" />}
            onClick={() => handleResolve('ACCEPT')}
          >
            Accept
          </Button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-ink-500 hover:text-ink-300 transition-colors p-1"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded score breakdown */}
      {expanded && (
        <div className="border-t border-ink-800 p-4 space-y-4">
          <h4 className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Matching Score Breakdown
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scoreEntries.map(([key, step]) => (
              <div key={key} className="flex items-center gap-3 py-1.5">
                <div className="w-32 shrink-0">
                  <p className="text-xs text-ink-400 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                </div>
                {/* Score bar */}
                <div className="flex-1 h-1.5 rounded-full bg-ink-700 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      step.score >= 0.8 ? 'bg-emerald-500'
                        : step.score >= 0.6 ? 'bg-amber-500'
                        : 'bg-red-500',
                    )}
                    style={{ width: `${step.score * 100}%` }}
                  />
                </div>
                <span className={cn(
                  'text-xs font-mono w-10 text-right shrink-0',
                  getConfidenceColor(getConfidenceLevel(step.score)),
                )}>
                  {(step.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>

          {/* Notes input */}
          <div className="pt-2">
            <label className="text-xs text-ink-500 block mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add context about your decision…"
              className="w-full px-3 py-2 rounded-lg text-sm bg-ink-800 border border-ink-700 text-ink-200 placeholder:text-ink-600 focus:outline-none focus:border-signal/50 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}