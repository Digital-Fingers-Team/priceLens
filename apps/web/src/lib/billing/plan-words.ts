import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * The dictionary's name and description for a plan. Most plans are worded
 * per tier; Seller Plus shares the SELLER tier with Seller, so it is matched
 * by key. Anything unknown falls back to the API's own (English) words.
 */
export function planWords(
  t: Dictionary,
  plan: { key?: string | null; tier: string; name: string; description?: string | null },
): { name: string; description: string | null } {
  const key: string = plan.key?.startsWith('seller_plus') ? 'SELLER_PLUS' : plan.tier;
  const words = (t.pricing.plans as Record<string, { name: string; description: string } | undefined>)[key];
  return words ?? { name: plan.name, description: plan.description ?? null };
}
