import {
  CATEGORY_PRICE_FLOOR_RATIO,
  DESCRIBES_DEVICE,
  DEVICE_ACCESSORY_PRICE_RATIO,
  DEVICE_CATEGORIES,
} from '../thresholds';
import type { MatchingTools } from '../types';

export interface CategorySanityInput {
  title: string;
  /** Base-currency price. */
  price: number;
  categoryName: string;
  /** Median accepted price in the category; null while too few listings to trust. */
  categoryMedian: number | null;
}

/**
 * Step 5 -- category sanity.
 *
 * Returns why the listing is not the kind of product its category holds, or
 * null. Two rules, both measured against the category median:
 *  - in a device category, an accessory title priced under 15% of the median
 *    (both must hold: a real phone "with free cover" says "cover" too);
 *  - in any category, a price under 2.5% of the median.
 */
export function checkCategorySanity(
  { title, price, categoryName, categoryMedian }: CategorySanityInput,
  { normalizer }: Pick<MatchingTools, 'normalizer'>,
): string | null {
  if (categoryMedian == null) {
    return null;
  }
  if (
    DEVICE_CATEGORIES.has(categoryName.trim().toLowerCase()) &&
    price < categoryMedian * DEVICE_ACCESSORY_PRICE_RATIO &&
    normalizer.isAccessory(title) &&
    !DESCRIBES_DEVICE.test(title)
  ) {
    return `accessory in the ${categoryName} category`;
  }
  if (price < categoryMedian * CATEGORY_PRICE_FLOOR_RATIO) {
    return `price ${price} is under ${CATEGORY_PRICE_FLOOR_RATIO * 100}% of the ${categoryName} median ${Math.round(categoryMedian)}`;
  }
  return null;
}
