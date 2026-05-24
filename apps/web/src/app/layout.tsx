import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/providers';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'PriceLens', template: '%s | PriceLens' },
  description:
    'Compare prices across Amazon, Newegg, Best Buy, and more. Find the best deal in seconds.',
  keywords: ['price comparison', 'best price', 'price tracker', 'deal finder'],
  openGraph: {
    type: 'website',
    siteName: 'PriceLens',
    title: 'PriceLens — Price Comparison Engine',
    description: 'Compare product prices across all major retailers in real-time.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col bg-ink-950">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}