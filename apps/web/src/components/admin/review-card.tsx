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
import { safeExternalHref } from '@/lib/utils/safe-href';

interface ReviewCardProps {
  item: ReviewQueueItem;
}

export function ReviewCard({ item }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const { mutate: resolve, isPending } = useResolveQueueItem();

  const confidenceLevel = getConfidenceLevel(item.confidence);
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
    <div className="rounded border border-border bg-surface overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div
            className={cn(
              'w-14 h-14 rounded flex items-center justify-center text-xl font-semibold border',
              confidenceLevel === 'high' && 'border-success/40 bg-success/10 text-success',
              confidenceLevel === 'medium' && 'border-warning/40 bg-warning/10 text-warning',
              confidenceLevel === 'low' && 'border-danger/40 bg-danger/10 text-danger',
            )}
          >
            {(item.confidence * 100).toFixed(0)}
          </div>
          <span className="label-mono text-muted">
            conf. %
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{item.sourceListing.platform.name}</Badge>
            <Badge
              variant={
                confidenceLevel === 'high'
                  ? 'success'
                  : confidenceLevel === 'medium'
                    ? 'warning'
                    : 'danger'
              }
            >
              {confidenceLevel} confidence
            </Badge>
            <span className="text-xs text-muted">{formatRelativeTime(item.createdAt)}</span>
          </div>

          <p dir="auto" className="text-sm font-semibold text-fg line-clamp-1">
            {item.sourceListing.rawTitle}
          </p>

          {item.canonicalProduct && (
            <p className="text-xs text-muted flex items-center gap-1">
              <Store className="w-4 h-4 shrink-0" aria-hidden />
              Candidate:{' '}
              <span className="text-muted font-medium">{item.canonicalProduct.title}</span>
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted">
            {item.sourceListing.rawPrice != null && (
              <span className="font-semibold text-brand">
                {formatCurrency(item.sourceListing.rawPrice ?? undefined, item.sourceListing.rawCurrency)}
              </span>
            )}
            <a
              href={safeExternalHref(item.sourceListing.externalUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-brand transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View listing <ExternalLink className="w-4 h-4" aria-hidden />
            </a>
          </div>
        </div>

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
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide score breakdown' : 'Show score breakdown'}
            className="rounded-sm p-2 text-muted transition-colors hover:text-fg"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <h4 className="label-mono text-muted">
            Matching Score Breakdown
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scoreEntries.map(([key, step]) => (
              <div key={key} className="flex items-center gap-3 py-2">
                <div className="w-32 shrink-0">
                  <p className="text-xs text-muted capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                </div>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      step.score >= 0.8
                        ? 'bg-success'
                        : step.score >= 0.6
                          ? 'bg-warning'
                          : 'bg-danger',
                    )}
                    style={{ width: `${step.score * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'text-xs font-mono w-10 text-end shrink-0',
                    getConfidenceColor(getConfidenceLevel(step.score)),
                  )}
                >
                  {(step.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <label className="text-xs text-muted block mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add context about your decision..."
              className="w-full px-3 py-2 rounded text-sm bg-surface border border-border-strong text-fg placeholder:text-muted resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
