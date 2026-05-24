import Link from 'next/link';
import { Search, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <div className="flex flex-col items-center text-center gap-6 max-w-md mx-auto">
        <div className="text-8xl font-black text-ink-800 select-none">404</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink-100">Page not found</h1>
          <p className="text-ink-400">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/">
            <Button variant="outline" leftIcon={<Home className="w-4 h-4" />}>
              Go home
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="primary" leftIcon={<Search className="w-4 h-4" />}>
              Search products
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
