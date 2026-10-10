import { ArrowRight } from 'lucide-react';
import { DropCard } from '@/components/deals/drop-card';
import { dealsApi } from '@/lib/api/deals.api';
import type { Locale } from '@/lib/i18n/config';
import { Link } from '@/lib/i18n/navigation';
import { getI18n } from '@/lib/i18n/server';

/** The home page's four biggest price drops; nothing at all when there are none or the API fails. */
export async function DropsSection({ locale }: { locale: Locale }) {
  const i18n = getI18n(locale);
  const { t } = i18n;
  let drops;
  try {
    drops = (await dealsApi.priceDrops(4)).drops;
  } catch {
    return null;
  }
  if (drops.length === 0) return null;

  return (
    <section className="mx-auto flex max-w-page flex-col gap-6 px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-fg">{t.priceDrops.title}</h2>
        <Link href="/price-drops" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">
          {t.home.seeAll}
          <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {drops.map((drop) => (
          <DropCard key={drop.listingId} drop={drop} i18n={i18n} />
        ))}
      </div>
    </section>
  );
}
