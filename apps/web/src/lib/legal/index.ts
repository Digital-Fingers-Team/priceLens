// Server components only: imports both languages' full text.
import type { Locale } from '@/lib/i18n/config';
import { legalAr } from './ar';
import { legalEn } from './en';
import type { LegalDoc, LegalSlug } from './types';

export * from './types';

const docs = { en: legalEn, ar: legalAr } as const;

export function legalDoc(locale: Locale, slug: LegalSlug): LegalDoc {
  return docs[locale][slug];
}
