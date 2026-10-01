export type SectionAccess = 'available' | 'locked' | 'hidden';

export interface Section<T> {
  access: SectionAccess;
  /** How many there are, also when locked (the honest teaser). */
  count: number;
  items: T[];
}

export interface InstallmentQuote {
  planId: string;
  provider: string;
  kind: 'BNPL' | 'BANK_CARD' | string;
  months: number;
  store: string;
  price: number;
  downPayment: number;
  monthly: number;
  adminFee: number;
  totalPaid: number;
  extraPct: number;
  validUntil: string | null;
  sourceUrl: string | null;
}

export interface PromoItem {
  id: string;
  type: 'CARD' | 'CASHBACK' | 'COUPON';
  title: string;
  titleAr: string | null;
  store: string | null;
  bankName: string | null;
  code: string | null;
  valueType: 'PERCENT' | 'AMOUNT';
  value: number;
  minSpend: number | null;
  validUntil: string | null;
  verified: boolean;
  lastVerifiedAt: string | null;
  workedCount: number;
  failedCount: number;
  price: number | null;
  saving: number;
  priceAfter: number | null;
  mine: boolean;
}

export type WarrantyKind = 'LOCAL_AGENT' | 'INTERNATIONAL' | 'SELLER' | 'NONE';

export interface BuyerExtras {
  currency: string;
  installments: Section<InstallmentQuote>;
  cardOffers: Section<PromoItem> & { banksSet?: boolean };
  coupons: Section<PromoItem>;
  warranty: {
    offers: Array<{ listingId: string; store: string; price: number; warranty: { type: WarrantyKind; months: number; agentName: string | null } | null }>;
    cheapestIsWeaker: { cheapest: string; stronger: string; extraCost: number } | null;
  } | null;
  caution: Array<{ listingId: string; store: string; caution: boolean; signals: Array<'FAR_BELOW_MARKET' | 'LOW_RATING' | 'FEW_REVIEWS' | 'NO_FEEDBACK_DATA'> }>;
}

export interface CartWatch {
  id: string;
  name: string;
  targetTotal: number;
  acrossStores: boolean;
  isActive: boolean;
  total: number | null;
  store: string | null;
  reached: boolean;
  createdAt: string;
  items: Array<{
    product: { id: string; slug: string; title: string; titleAr: string | null; imageUrl: string | null };
    qty: number;
    store: string | null;
    price: number | null;
  }>;
}
