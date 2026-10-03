import { normalizeArabic, toMatchingText } from './arabic';
import { DESCRIBES_DEVICE } from '../pipeline/thresholds';

/** The leaf phone and tablet cases, screen protectors and spare screens belong to. */
export const PHONE_ACCESSORIES_SLUG = 'phone-accessories';

/**
 * What the title says it is: a case, a protector or a spare part. Arabic words
 * are matched after letter folding (ة -> ه, أ -> ا).
 */
const ACCESSORY_NOUN = new RegExp(
  [
    String.raw`\b(cases?|covers?|bumper|flip|holster|screen\s+protectors?|tempered\s+glass|hydrogel|privacy\s+(?:glass|film)|protective\s+film|lens\s+protector|back\s+glass|digitizer|display\s+assembly|screen\s+replacement|replacement\s+screen|lcd\s+replacement|housing|flex\s+cable)\b`,
    String.raw`(جراب|كفر|غطاء|واقي|اسكرينه|لاصقه|زجاج\s*مقوي|شاشه\s+بديله)`,
  ].join('|'),
  'i',
);

/**
 * The device it is for is a phone or a tablet. Arabic "موبايل/هاتف/جوال"
 * arrive as "phone" (toMatchingText); a bare "Samsung" counts only with a
 * phone model code ("Samsung A05s").
 */
const FOR_PHONE_OR_TABLET =
  /\b(phones?|iphone|galaxy|redmi|xiaomi|poco|oppo|realme|vivo|infinix|tecno|itel|honor|huawei|nokia|motorola|pixel|oneplus|ipad|tablets?|tab)\b|\bsamsung\s+[aszmf]\d{1,3}/i;

/**
 * Accessories of other devices stay in their own leaf: a watch strap, an
 * earbuds case or a console skin is not a phone accessory (nor a printer
 * "for phone cases"), even when the
 * title also says "compatible with iPhone".
 */
const OTHER_DEVICE = /\b(watch|watches|buds|earbuds|airpods|headphones?|earphones?|headset|laptop|macbook|notebook|monitor|printer|machine|gimbal|stabilizer|playstation|ps[345]|xbox|nintendo|controller|gamepad|remote|kindle|tv|television)\b|(ساعه|سماعه|لابتوب|ريموت)/i;

/**
 * The device itself: sold with a case ("Lenovo Tab With Kids Bumper Case",
 * "With Pen + Folio Case"), or described by its specs (storage, battery,
 * camera), which a case or a spare screen never states.
 */
const THE_DEVICE =
  /(?:\b(?:free|gift|with)|\+)\s+(?:[\w-]+\s+){0,3}(case|cover)\b|(مع|هديه)\s+(جراب|كفر)|\b\d+\s?(gb|tb)\b|\b\d+\s?mah\b|\b\d+\s?mp\b|\bandroid\s+\d+|\b(octa|8)[\s-]core\b/i;

/**
 * A case, screen protector or spare screen for a phone or tablet. Store
 * sweeps for headphones and smart watches return these by the thousand, and
 * the category used to be whichever sweep found them, so the same case was
 * created once under Headphones and again under Smart Watches.
 */
export function isPhoneAccessory(title: string): boolean {
  const text = normalizeArabic(toMatchingText(title)).toLowerCase();
  if (!ACCESSORY_NOUN.test(text) || !FOR_PHONE_OR_TABLET.test(text)) return false;
  if (OTHER_DEVICE.test(text) || THE_DEVICE.test(text) || DESCRIBES_DEVICE.test(text)) return false;
  return true;
}
