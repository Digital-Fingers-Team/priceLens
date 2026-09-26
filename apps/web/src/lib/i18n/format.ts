import { intlLocale, type Locale } from './config';

/** "Compare {count} stores" + { count: 3 } -> "Compare 3 stores". */
export function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/**
 * Plural forms by CLDR category. Arabic uses all six (zero, one, two, few,
 * many, other); English only one/other. `other` is the fallback.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function plural(locale: Locale, forms: PluralForms, count: number, vars: Record<string, string | number> = {}) {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  return interpolate(forms[category] ?? forms.other, { count: formatCount(locale, count), ...vars });
}

function formatCount(locale: Locale, count: number) {
  return new Intl.NumberFormat(intlLocale(locale)).format(count);
}
