import type { Metadata } from 'next';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t } = getI18n(locale);
  return { title: t.nav.business, robots: NOINDEX };
}

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
