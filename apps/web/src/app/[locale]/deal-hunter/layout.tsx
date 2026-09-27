import type { Metadata } from 'next';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

/** Metadata for a client page (it cannot export its own); audit 09. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t } = getI18n(locale);
  return {
    title: t.nav.dealHunter,
    description: t.seo.dealHunterDescription,
    alternates: localizedAlternates(locale, '/deal-hunter'),
  };
}

export default function DealHunterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
