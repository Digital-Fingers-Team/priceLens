import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from '@/components/layout/providers';
import { PageTracker } from '@/components/analytics/page-tracker';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { locales, localeDir } from '@/lib/i18n/config';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/provider';
import { baseMetadata } from '@/lib/seo';
import { THEME_SCRIPT } from '@/lib/theme';
import designTokens from '../../../design-tokens';

// IBM Plex: Sans (variable, Latin), Sans Arabic, Mono (audit 07, UI-05).
// Arabic and Mono are not preloaded: the browser fetches them when a glyph
// needs them (unicode-range), so English pages don't pay for Arabic.
const plexSans = IBM_Plex_Sans({ weight: 'variable', subsets: ['latin'], variable: '--font-plex-sans', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500', '600'],
  subsets: ['arabic'],
  variable: '--font-plex-arabic',
  display: 'swap',
  preload: false,
});
const plexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});

export const viewport: Viewport = { themeColor: designTokens.themes.light.brand };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = getI18n(await resolveLocale(params));
  return {
    ...baseMetadata,
    title: { default: t.meta.siteTitle, template: `%s | ${t.meta.siteName}` },
    description: t.meta.description,
    openGraph: { ...baseMetadata.openGraph, title: t.meta.siteTitle, description: t.meta.shortDescription },
    twitter: { ...baseMetadata.twitter, title: t.meta.siteTitle, description: t.meta.shortDescription },
    icons: {
      icon: [
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      // Apple composites a transparent icon onto black; this one carries the
      // white background from the brand assets instead.
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.webmanifest',
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  const { t } = getI18n(locale);

  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      className={`${plexSans.variable} ${plexArabic.variable} ${plexMono.variable}`}
      // The theme script sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <I18nProvider locale={locale} dict={t}>
          <Providers>
            <a
              href="#main"
              className="sr-only z-50 bg-brand px-4 py-2 font-mono text-xs uppercase text-brand-fg focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
            >
              {t.nav.skipToContent}
            </a>
            <Navbar />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
            {/* useSearchParams: without a boundary it would opt every page out of static rendering. */}
            <Suspense fallback={null}>
              <PageTracker />
            </Suspense>
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
