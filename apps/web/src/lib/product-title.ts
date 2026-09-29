import type { Locale } from './i18n/config';

/**
 * A product's name in the page's language. The stores give English titles;
 * the Arabic one is translated by the AI in the background (API
 * TitleTranslationService), so until then the Arabic site shows the store's.
 */
export function productTitle(product: { title: string; titleAr?: string | null }, locale: Locale): string {
  return (locale === 'ar' && product.titleAr) || product.title;
}
