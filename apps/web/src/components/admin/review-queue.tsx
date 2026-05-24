'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { useReviewQueue } from '@/lib/hooks/use-admin';
import { ReviewCard } from './review-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function ReviewQueue() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useReviewQueue(page);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ClipboardCheck className="w-12 h-12 text-emerald-500/40 mb-4" />
        <h3 className="font-semibold text-ink-300">Queue is empty</h3>
        <p className="text-sm text-ink-500 mt-1">All matches have been reviewed. Great work!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <span className="text-ink-200 font-semibold">{data.total}</span> items pending review
        </p>
        {isFetching && (
          <span className="text-xs text-ink-500 animate-pulse">Refreshing…</span>
        )}
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <ReviewCard key={item.id} item={item} />
        ))}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>

          <span className="text-sm text-ink-500">
            Page {page} of {data.totalPages}
          </span>

          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="w-4 h-4" />}
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}