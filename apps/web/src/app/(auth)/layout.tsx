import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,255,136,0.04), transparent)',
        }}
      />

      <div className="w-full max-w-sm space-y-6 relative">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-signal flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-ink-950" />
            </div>
            <span className="font-black text-xl text-ink-50">
              Price<span className="text-signal">Lens</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}