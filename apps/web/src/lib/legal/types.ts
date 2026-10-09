/** The legal pages, at /legal/<slug>. Order is the footer's order. */
export const LEGAL_SLUGS = ['terms', 'privacy', 'refunds', 'cookies'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

/** Where privacy, refund and support requests go. */
export const SUPPORT_EMAIL = 'support@pricelens.store';

/** When the text last changed (ISO date). Bump it with every edit. */
export const LEGAL_UPDATED = '2026-10-09';

/** A paragraph, or a bulleted list when it is an array. */
export type LegalBlock = string | string[];

export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** The meta description and the lede under the title. */
  description: string;
  sections: LegalSection[];
}

export type LegalDocs = Record<LegalSlug, LegalDoc>;
