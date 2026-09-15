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
  brand: string | null;
  imageUrl: string | null;
  categoryName: string;
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
}

export interface DealHunterResult {
  query: string;
  parsed: ParsedQuery;
  interpretation: string;
  matches: DealHunterMatch[];
  totalCandidates: number;
  currency: string;
  notice: string | null;
}
