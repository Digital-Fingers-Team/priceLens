import type { Metadata } from 'next';
import { ReviewQueue } from '@/components/admin/review-queue';

export const metadata: Metadata = { title: 'Review Queue — Admin' };

export default function AdminReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-100">Review Queue</h1>
        <p className="text-sm text-ink-500 mt-1">
          Medium-confidence matches that need a human decision.
          Accept to confirm the match, reject to discard it.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}