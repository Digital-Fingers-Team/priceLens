import type { Metadata } from 'next';
import { TrendingDown } from 'lucide-react';
import { DropCard } from '@/components/deals/drop-card';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { EmptyState } from '@/components/ui/state';
import { dealsApi } from '@/lib/api/deals.api';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { localizedAlternates } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import { serializeJsonLd } from '@/lib/utils/json-ld';
import type { PriceDropsPage } from '@/types/deals.types';

// The API rebuilds the list hourly; the page follows within 10 minutes.
export const revalidate = 600;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { t } = getI18n(locale);
  return {
    title: t.priceDrops.metaTitle,
    description: t.priceDrops.description,
    alternates: localizedAlternates(locale, '/price-drops'),
  };
}

/**
 * Real price drops: each store price against the same listing's own 30-day
 * median (apps/api/src/deals/price-drops.service.ts). Server-rendered so it
 * can rank for "عروض" / "تخفيضات" searches and be shared.
 */
export default async function PriceDropsRoute({ params }: Props) {
  const locale = await resolveLocale(params);
  const i18n = getI18n(locale);
  const { t, tf, fmt, href } = i18n;

  let data: PriceDropsPage | null = null;
  try {
    data = await dealsApi.priceDrops(60);
  } catch {
    // Shown as "could not load"; the next revalidation tries again.
  }

  const trail = [
    { name: t.seo.home, path: href('/') },
    { name: t.priceDrops.title, path: href('/price-drops') },
  ];

  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd(trail)) }} />

      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.seo.home, href: '/' }, { label: t.priceDrops.title }]} label={t.seo.breadcrumbs} />
        <h1 className="text-2xl font-semibold text-fg">{t.priceDrops.title}</h1>
        <p className="max-w-2xl text-sm text-muted">{t.priceDrops.lede}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          {data && <span>{tf(t.priceDrops.updated, { time: fmt.relative(data.generatedAt) })}</span>}
          {data?.telegramUrl && (
            <a href={data.telegramUrl} target="_blank" rel="noopener" className="font-medium text-brand-text hover:underline">
              {t.priceDrops.telegram}
            </a>
          )}
        </div>
      </div>

      {!data ? (
        <EmptyState icon={<TrendingDown className="h-5 w-5" />} title={t.priceDrops.unavailable} className="rounded border border-border" />
      ) : data.drops.length === 0 ? (
        <EmptyState icon={<TrendingDown className="h-5 w-5" />} title={t.priceDrops.empty} className="rounded border border-border" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.drops.map((drop, i) => (
            <DropCard key={drop.listingId} drop={drop} i18n={i18n} priority={i < 4} />
          ))}
        </div>
      )}

      <section className="max-w-2xl rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">{t.priceDrops.howTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.priceDrops.how}</p>
      </section>
    </div>
  );
}
