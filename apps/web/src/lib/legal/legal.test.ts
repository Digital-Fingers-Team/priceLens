import { describe, expect, it } from 'vitest';
import { optedOut } from '@/components/analytics/page-tracker';
import { en } from '@/lib/i18n/dictionaries/en';
import { legalAr } from './ar';
import { legalEn } from './en';
import { LEGAL_SLUGS, LEGAL_UPDATED, isLegalSlug } from './types';

describe('legal pages', () => {
  it.each(LEGAL_SLUGS)('%s has the same shape in Arabic and English', (slug) => {
    const shape = (doc: typeof legalEn.terms) =>
      doc.sections.map((s) => s.body.map((block) => (Array.isArray(block) ? block.length : 'p')));
    expect(shape(legalAr[slug])).toEqual(shape(legalEn[slug]));
  });

  it('has no empty text', () => {
    for (const docs of [legalEn, legalAr]) {
      for (const slug of LEGAL_SLUGS) {
        const doc = docs[slug];
        expect(doc.title.trim()).not.toBe('');
        for (const section of doc.sections) {
          expect(section.heading.trim()).not.toBe('');
          for (const text of section.body.flat()) expect(text.trim()).not.toBe('');
        }
      }
    }
  });

  it('every slug has a footer label', () => {
    for (const slug of LEGAL_SLUGS) expect(en.legal.docs[slug]).toBeTruthy();
    expect(isLegalSlug('terms')).toBe(true);
    expect(isLegalSlug('nope')).toBe(false);
  });

  it('the updated date is a real ISO date', () => {
    expect(new Date(LEGAL_UPDATED).toISOString().slice(0, 10)).toBe(LEGAL_UPDATED);
  });

  // The cookie policy promises this.
  it('the page tracker respects Global Privacy Control and Do Not Track', () => {
    const nav = (v: Partial<Navigator & { globalPrivacyControl: boolean }>) => v as Navigator;
    expect(optedOut(nav({ globalPrivacyControl: true }))).toBe(true);
    expect(optedOut(nav({ doNotTrack: '1' }))).toBe(true);
    expect(optedOut(nav({ doNotTrack: '0', globalPrivacyControl: false }))).toBe(false);
  });
});
