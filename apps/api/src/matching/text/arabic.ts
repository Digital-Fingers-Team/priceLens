/**
 * Arabic text normalization for matching and search.
 *
 * Stores in this market title the same product in Arabic and English, and
 * Arabic spelling itself varies: hamza forms of alef (أ إ آ ٱ), final yaa
 * written as alef maqsura (ى), taa marbuta written as haa (ة / ه), optional
 * diacritics and tatweel, and three digit systems (0-9, ٠-٩, ۰-۹). Two titles
 * that differ only in these must compare equal, and "٢٥٦ جيجا" must read as
 * "256 GB" for the variant guards.
 */

const ARABIC_INDIC_ZERO = 0x0660;
const EASTERN_ARABIC_INDIC_ZERO = 0x06f0;

/** Arabic-Indic and Eastern Arabic-Indic digits to ASCII; Arabic separators to their Latin forms. */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - EASTERN_ARABIC_INDIC_ZERO))
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, '') // Arabic thousands separator
    .replace(/،/g, ',') // Arabic comma
    .replace(/؛/g, ';'); // Arabic semicolon
}

/**
 * Letter-level normalization: one form per letter family, no diacritics, no
 * tatweel. Latin text is untouched.
 */
export function normalizeArabicLetters(text: string): string {
  return text
    .replace(/[ً-ٰٟ]/g, '') // harakat, tanween, shadda, sukun, superscript alef
    .replace(/ـ/g, '') // tatweel
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي'); // ئ -> ي
}

/** Digits and letters: the form every Arabic comparison works on. */
export function normalizeArabic(text: string): string {
  return normalizeArabicLetters(normalizeDigits(text));
}

/**
 * Arabic words (already letter-normalized) that have one English spelling in
 * store titles: brands, product lines, tiers, units and common colors. Longer
 * phrases first, so "ذاكره عشوائيه" wins over "ذاكره".
 *
 * Only words whose meaning does not depend on context are listed. "شاشه"
 * (screen, display, monitor, TV) is left out on purpose.
 */
const ARABIC_TERMS: ReadonlyArray<readonly [string, string]> = [
  // Memory and storage labels.
  ['ذاكره عشوائيه', 'ram'],
  ['ذاكره داخليه', 'storage'],
  ['مساحه تخزين', 'storage'],
  ['سعه تخزين', 'storage'],
  ['ذاكره تخزين', 'storage'],
  ['ذاكره', 'storage'],
  ['تخزين', 'storage'],
  ['رام', 'ram'],
  // Units.
  ['جيجا بايت', 'gb'],
  ['جيجابايت', 'gb'],
  ['غيغابايت', 'gb'],
  ['جيجا', 'gb'],
  ['جيجابيت', 'gb'],
  ['تيرا بايت', 'tb'],
  ['تيرابايت', 'tb'],
  ['تيرا', 'tb'],
  ['ميجا بايت', 'mb'],
  ['ميجابايت', 'mb'],
  ['مللي لتر', 'ml'],
  ['ملليلتر', 'ml'],
  ['مليلتر', 'ml'],
  ['مللي', 'ml'],
  ['مل', 'ml'],
  ['لتر', 'l'],
  ['كيلوجرام', 'kg'],
  ['كيلو جرام', 'kg'],
  ['كجم', 'kg'],
  ['كيلو', 'kg'],
  ['جرام', 'g'],
  ['غرام', 'g'],
  ['جم', 'g'],
  ['بوصه', 'inch'],
  ['انش', 'inch'],
  ['عبوه', 'pack'],
  ['قطع', 'pcs'],
  ['قطعه', 'pcs'],
  // Brands and product lines.
  ['سامسونج', 'samsung'],
  ['سامسونغ', 'samsung'],
  ['جالاكسي', 'galaxy'],
  ['جلاكسي', 'galaxy'],
  ['غالاكسي', 'galaxy'],
  ['اي فون', 'iphone'],
  ['ايفون', 'iphone'],
  ['ابل', 'apple'],
  ['ماك بوك', 'macbook'],
  ['ماكبوك', 'macbook'],
  ['ايباد', 'ipad'],
  ['شاومي', 'xiaomi'],
  ['شياومي', 'xiaomi'],
  ['ريدمي', 'redmi'],
  ['نوت', 'note'],
  ['اوبو', 'oppo'],
  ['هواوي', 'huawei'],
  ['هونر', 'honor'],
  ['ريلمي', 'realme'],
  ['نوكيا', 'nokia'],
  ['انفينكس', 'infinix'],
  ['انفنكس', 'infinix'],
  ['تكنو', 'tecno'],
  ['تيكنو', 'tecno'],
  ['فيفو', 'vivo'],
  ['ون بلس', 'oneplus'],
  ['لينوفو', 'lenovo'],
  ['ديل', 'dell'],
  ['اسوس', 'asus'],
  ['سوني', 'sony'],
  ['بلايستيشن', 'playstation'],
  ['بلاي ستيشن', 'playstation'],
  ['نسكافيه', 'nescafe'],
  ['نسكافي', 'nescafe'],
  ['بيبسي', 'pepsi'],
  ['برسيل', 'persil'],
  // Tiers.
  ['برو ماكس', 'pro max'],
  ['برو', 'pro'],
  ['ماكس', 'max'],
  ['الترا', 'ultra'],
  ['بلس', 'plus'],
  ['ميني', 'mini'],
  ['لايت', 'lite'],
  // Condition.
  ['مستعمل', 'used'],
  ['مجدد', 'refurbished'],
  // Kinds of product.
  ['لابتوب', 'laptop'],
  ['تلفزيون', 'tv'],
  ['تليفزيون', 'tv'],
  ['موبايل', 'phone'],
  ['جوال', 'phone'],
  ['هاتف', 'phone'],
  ['كلاسيك', 'classic'],
  ['قهوه', 'coffee'],
  // Colors (stored per offer; never a matching conflict, D-6).
  ['اسود', 'black'],
  ['ابيض', 'white'],
  ['ازرق', 'blue'],
  ['كحلي', 'navy'],
  ['رمادي', 'gray'],
  ['احمر', 'red'],
  ['اخضر', 'green'],
  ['ذهبي', 'gold'],
  ['فضي', 'silver'],
  ['بنفسجي', 'purple'],
  ['وردي', 'pink'],
  ['تيتانيوم', 'titanium'],
  ['صحراوي', 'desert'],
];

const TERM_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = ARABIC_TERMS.map(([arabic, english]) => [
  // Letters on either side mean the phrase is part of a longer word. A digit
  // may touch it ("256جيجا"). An optional leading "ال" (the) is absorbed.
  new RegExp(`(?<!\\p{L})(?:ال)?${arabic.replace(/ /g, '\\s+')}(?!\\p{L})`, 'gu'),
  ` ${english} `,
]);

const HAS_ARABIC = /[؀-ۿ]/;

/**
 * The title as the matcher reads it: Arabic normalized, and Arabic words with
 * a fixed English spelling replaced by it, so "سامسونج جالاكسي A57 رام ١٢
 * جيجا" and "Samsung Galaxy A57 12GB RAM" meet on the same words. Titles with
 * no Arabic come back unchanged.
 */
export function toMatchingText(title: string): string {
  const digits = normalizeDigits(title);
  if (!HAS_ARABIC.test(digits)) {
    return digits;
  }
  let text = normalizeArabicLetters(digits);
  for (const [pattern, english] of TERM_PATTERNS) {
    text = text.replace(pattern, english);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Every English spelling an Arabic search word stands for (search query expansion). */
export function englishEquivalents(word: string): string[] {
  const normalized = normalizeArabic(word.trim().toLowerCase()).replace(/^ال/, '');
  return ARABIC_TERMS.filter(([arabic]) => arabic === normalized).map(([, english]) => english);
}
