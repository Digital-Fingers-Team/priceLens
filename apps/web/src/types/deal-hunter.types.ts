export interface SpecConstraint {
  field: 'gpu' | 'cpu' | 'ram' | 'storage' | 'displaySize';
  value: string;
  raw: string;
}

export interface ParsedQuery {
  price: { min: number | null; max: number | null };
  categorySlugs: string[];
  brands: string[];
  specs: SpecConstraint[];
  unparsed: string;
  isEmpty: boolean;
}

export interface DealHunterMatch {
  productId: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  brand: string | null;
  imageUrl: string | null;
  categoryName: string;
  categoryNameAr?: string | null;
  price: number | null;
  currency: string;
  storeCount: number;
  inStock: boolean | null;
  dealScore: number | null;
  dealGrade: string | null;
  matchScore: number;
  specsMatched: SpecConstraint[];
  specsUnconfirmed: SpecConstraint[];
  reasons: string[];
  /** The reasons as codes (worded by the dictionary); older API answers lack them. */
  reasonCodes?: DealHunterReason[];
}

export interface DealHunterReason {
  code:
    | 'UNDER_BUDGET'
    | 'AT_BUDGET'
    | 'CHEAPEST'
    | 'MATCHES'
    | 'UNCONFIRMED'
    | 'COMPARED'
    | 'ONE_STORE'
    | 'CHEAPER_THAN_HISTORY'
    | 'NO_HISTORY';
  params: Record<string, number | string>;
}

export interface DealHunterResult {
  query: string;
  parsed: ParsedQuery;
  interpretation: string;
  matches: DealHunterMatch[];
  totalCandidates: number;
  currency: string;
  notice: string | null;
  noticeCode?: 'UNREADABLE' | 'NO_MATCHES' | null;
}
