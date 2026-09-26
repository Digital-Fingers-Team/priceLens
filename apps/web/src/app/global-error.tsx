'use client';
import './globals.css';

/**
 * Last-resort boundary for errors thrown by the root layout itself (navbar,
 * providers), which app/error.tsx cannot catch because it renders inside that
 * layout. It replaces the whole document, so it brings its own <html>/<body>
 * and uses no shared components that might be what failed.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
        <main className="flex flex-col items-center text-center gap-6 max-w-md">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink-50">Something went wrong</h1>
            <p className="text-ink-400">An unexpected error occurred. Please try again.</p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="h-10 px-4 rounded-lg bg-signal text-ink-950 font-semibold"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
