'use client';
import './globals.css';

/**
 * Last-resort boundary for errors thrown by the root layout itself (navbar,
 * providers), which error.tsx cannot catch because it renders inside that
 * layout. It replaces the whole document, so it brings its own <html>/<body>
 * and uses no shared components (not even the i18n provider) that might be
 * what failed; the text is in both languages.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-bg p-4 text-fg">
        <main className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p lang="ar" dir="rtl" className="text-xl font-semibold">
              حدث خطأ ما
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded bg-brand px-4 font-mono text-xs font-medium uppercase tracking-wider text-brand-fg"
          >
            Try again · حاول مرة أخرى
          </button>
        </main>
      </body>
    </html>
  );
}
