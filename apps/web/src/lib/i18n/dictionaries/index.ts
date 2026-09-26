import type { PluralForms } from '../format';
import { en } from './en';
import { ar } from './ar';

/** en.ts is the source; ar.ts must have exactly its shape (tsc checks). */
type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : string extends keyof T
      ? T // an open map (categories, tiers): keys may differ per language
      : T extends PluralForms
        ? PluralForms
        : { [K in keyof T]: Widen<T[K]> };
export type Dictionary = Widen<typeof en>;

export const dictionaries = { en, ar } as const;
