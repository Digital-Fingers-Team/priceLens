'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Product page error:', error);
  }, [error]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <div className="flex flex-col items-center text-center gap-6 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink-100">Something went wrong</h1>
          <p className="text-ink-400">
            We couldn&apos;t load this product page. It may have been removed or there&apos;s a temporary issue.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs font-mono text-red-400/70 mt-2">{error.message}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => history.back()}>
            Go back
          </Button>
          <Button variant="primary" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={reset}>
            Try again
          </Button>
        </div>
        <Link href="/search" className="text-sm text-ink-500 hover:text-signal transition-colors">
          Browse all products →
        </Link>
      </div>
    </div>
  );
}
