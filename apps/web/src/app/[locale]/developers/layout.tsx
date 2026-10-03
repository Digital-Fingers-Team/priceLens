import type { Metadata } from 'next';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { localizedAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t } = getI18n(locale);
  return {
    title: t.developers.title,
    description: t.developers.lede,
    alternates: localizedAlternates(locale, '/developers'),
  };
}

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
