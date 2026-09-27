import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { ReviewQueue } from '@/components/admin/review-queue';

export const metadata: Metadata = { title: 'Review Queue — Admin', robots: NOINDEX };

export default function AdminReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Review Queue</h1>
        <p className="text-sm text-muted mt-1">
          Medium-confidence matches that need a human decision.
          Accept to confirm the match, reject to discard it.
        </p>
      </div>
      <ReviewQueue />
    </div>
  );
}