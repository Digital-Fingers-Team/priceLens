import { Prisma } from '@prisma/client';
import { MULTI_WORD_ARABIC_TERMS, englishEquivalents, normalizeArabic } from '../matching/text/arabic';

/**
 * Search text handling (audit 02, L-15).
 *
 * A query is split into terms; every term must match. Each term carries its
 * alternatives: the Arabic-normalized word itself (so Arabic titles match
 * whatever alef, taa marbuta or digit forms they use) plus its English
 * spellings from the matcher's dictionary (so "سامسونج جالاكسي" finds
 * "Samsung Galaxy"). Multi-word dictionary phrases ("اي فون") stay one term.
 */
export function searchTermGroups(query: string): string[][] {
  let text = normalizeArabic(query.toLowerCase()).replace(/\s+/g, ' ').trim();
  if (!text) return [];

  // Join multi-word phrases so they expand as one unit ("اي فون" -> "اي_فون").
  for (const phrase of MULTI_WORD_ARABIC_TERMS) {
    text = text.replace(
      new RegExp(`(?<!\\p{L})(?:ال)?${phrase.replace(/ /g, ' ')}(?!\\p{L})`, 'gu'),
      phrase.replace(/ /g, '_'),
    );
  }

  return text
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const word = token.replace(/_/g, ' ');
      return Array.from(new Set([word, ...englishEquivalents(word)]));
    });
}

/** The whole query in its English-spelled form, for the full-phrase bonus. */
export function searchPhrase(groups: string[][]): string {
  return groups.map((alternatives) => alternatives[alternatives.length - 1]).join(' ');
}

// Postgres side of normalizeArabic, applied to titles so both sides compare
// in the same form. Must stay in step with matching/text/arabic.ts.
const TRANSLATE_FROM = 'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
const TRANSLATE_TO = 'اااايهوي01234567890123456789';
const DIACRITICS = '[ً-ٰٟـ]';

/** `lower(expr)` with Arabic letter forms, digits, diacritics and tatweel normalized. */
export function normalizedTextSql(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`regexp_replace(translate(lower(${expr}), ${TRANSLATE_FROM}, ${TRANSLATE_TO}), ${DIACRITICS}, '', 'g')`;
}
