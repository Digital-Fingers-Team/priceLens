/** GET /deals/price-drops (apps/api/src/deals/price-drops.service.ts). */
export interface PriceDrop {
  productId: string;
  slug: string;
  title: string;
  titleAr: string | null;
  brand: string | null;
  imageUrl: string | null;
  categorySlug: string;
  listingId: string;
  store: string;
  storeSlug: string;
  /** Today's price at that store, EGP. */
  price: number;
  /** The same listing's median daily price over the last 30 days. */
  usualPrice: number;
  dropPct: number;
  historyDays: number;
  storeCount: number;
}

export interface PriceDropsPage {
  generatedAt: string;
  drops: PriceDrop[];
  /** The public deals channel, when one is set. */
  telegramUrl?: string | null;
}
