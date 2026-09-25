import type { ListingIdentifiers } from '../types';

type IdentifierKey = keyof ListingIdentifiers;
const IDENTIFIER_KEYS: IdentifierKey[] = ['gtin', 'upc', 'ean', 'mpn'];

/**
 * Step 6 -- identifier match.
 *
 * The OR-clauses for looking a listing up by any identifier it carries. An
 * empty list means it carries none, and the lookup is skipped.
 */
export function identifierLookupClauses(identifiers: ListingIdentifiers): Array<Partial<Record<IdentifierKey, string>>> {
  const clauses: Array<Partial<Record<IdentifierKey, string>>> = [];
  for (const key of IDENTIFIER_KEYS) {
    const value = identifiers[key];
    if (value) clauses.push({ [key]: value });
  }
  return clauses;
}

/**
 * Same store, near-identical titles, different SKUs (e.g. ELARABY's many
 * "Remote Control TORNADO LED TV Black" remotes) must never merge: when both
 * sides carry the same kind of identifier and the values differ, they are
 * different products no matter how similar the titles look.
 */
export function identifiersConflict(a: ListingIdentifiers, b: ListingIdentifiers): boolean {
  return IDENTIFIER_KEYS.some((key) => {
    const x = a[key];
    const y = b[key];
    return !!x && !!y && x.trim().toLowerCase() !== y.trim().toLowerCase();
  });
}
