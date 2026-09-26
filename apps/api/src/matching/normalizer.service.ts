import { Injectable } from '@nestjs/common';
import { ExtractedAttributes, NormalizedTitle } from './interfaces/matching.interfaces';
import { normalizeArabic, toMatchingText } from './text/arabic';
import { extractMemorySpec } from './text/specs';

const BRAND_ALIASES: Record<string, string> = {
  nvidia: 'NVIDIA',
  geforce: 'NVIDIA',
  rtx: 'NVIDIA',
  gtx: 'NVIDIA',
  amd: 'AMD',
  radeon: 'AMD',
  rx: 'AMD',
  intel: 'Intel',
  arc: 'Intel',
  apple: 'Apple',
  samsung: 'Samsung',
  lg: 'LG',
  asus: 'ASUS',
  asustek: 'ASUS',
  msi: 'MSI',
  gigabyte: 'Gigabyte',
  evga: 'EVGA',
  zotac: 'ZOTAC',
  powercolor: 'PowerColor',
  xfx: 'XFX',
  sapphire: 'Sapphire',
  dell: 'Dell',
  hp: 'HP',
  'hewlett-packard': 'HP',
  lenovo: 'Lenovo',
  thinkpad: 'Lenovo',
  microsoft: 'Microsoft',
  surface: 'Microsoft',
  sony: 'Sony',
  google: 'Google',
  pixel: 'Google',
  oneplus: 'OnePlus',
  motorola: 'Motorola',
  razer: 'Razer',
  corsair: 'Corsair',
  logitech: 'Logitech',
  kingston: 'Kingston',
  crucial: 'Crucial',
  seagate: 'Seagate',
  'western digital': 'Western Digital',
  wd: 'Western Digital',
  oppo: 'OPPO',
  reno: 'OPPO',
  xiaomi: 'Xiaomi',
  redmi: 'Xiaomi',
  poco: 'Xiaomi',
  huawei: 'Huawei',
  honor: 'Honor',
  vivo: 'Vivo',
  realme: 'realme',
  nokia: 'Nokia',
  infinix: 'Infinix',
  tecno: 'Tecno',
  itel: 'itel',
  nothing: 'Nothing',
  playstation: 'Sony',
};

const CRITICAL_VARIANTS = [
  /\bXT X\b/i,
  /\bXTX\b/i,
  /\bPro Max\b/i,
  /\bSuper\b/i,
  /\bUltra\b/i,
  /\bPlus\b/i,
  /\bMini\b/i,
  /\bLite\b/i,
  /\bTi\b/i,
  /\bGRE\b/i,
  /\bPro\b/i,
  /\bMax\b/i,
  /\bSE\b/i,
  /\bXT\b/i,
];

/**
 * Phone brands with no dedicated model regex below (unlike GPU/Mac/Galaxy/
 * iPhone). Deliberately excludes CPU/GPU/laptop brands (AMD, NVIDIA, ASUS,
 * HP, ...): those often repeat a shared prefix ("Ryzen 7") ahead of the
 * digits that actually distinguish two different SKUs, so the generic
 * single-next-token capture below would wrongly call two different chips
 * the "same model" — a mistake this narrower brand list avoids.
 */
const GENERIC_MODEL_BRANDS = new Set([
  'oppo', 'xiaomi', 'redmi', 'poco', 'huawei', 'honor', 'vivo', 'realme',
  'nokia', 'infinix', 'tecno', 'itel', 'nothing', 'oneplus', 'motorola', 'reno',
]);

/** Words that mean the tokens after a brand are not a model name ("Xiaomi Smart Band 9" is fine, "Honor Phone 5G" is not). */
const GENERIC_MODEL_STOP_WORDS = new Set(['phone', 'smartphone', 'mobile', 'dual', 'sim', 'new', 'original', 'for', 'with', 'and', 'the']);

/** Aliases that are a line of a parent brand; kept at the front of the model. */
const SUB_BRAND_PREFIXES = new Set(['redmi', 'poco', 'reno']);

const MODEL_TOKEN_UNIT_SUFFIXES = new Set([
  'gb', 'tb', 'mb', 'kb', 'mp', 'mah', 'mm', 'cm', 'in', 'inch',
  'hz', 'khz', 'mhz', 'ghz', 'fps', 'db', 'kw', 'ma', 'g', 'k', 'p', 'w', 'v',
]);

const CPU_PATTERN = /\b(i[3579]-\d{4,5}[A-Z]*|Core\s+i[3579]|Ryzen\s+\d+|M[123]\s+(?:Pro|Max|Ultra)?|Snapdragon\s+\d+)\b/gi;
const DISPLAY_PATTERN = /\b(\d{1,2}(?:\.\d)?)[-\s]?(?:inch|"|in\b|'')/gi;

@Injectable()
export class NormalizerService {
  /**
   * The title as every matching decision reads it: Arabic normalized and
   * its fixed-meaning words in English (see text/arabic.ts). English titles
   * come back unchanged except for Arabic-Indic digits.
   */
  matchingText(raw: string): string {
    return toMatchingText(raw);
  }

  normalizeTitle(raw: string): NormalizedTitle {
    let text = this.matchingText(raw);

    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    text = text.replace(/\s+/g, ' ').trim();

    const fillerWords = [
      'genuine',
      'authentic',
      'official',
      'brand new',
      'new',
      'factory sealed',
      'sealed',
      'retail box',
      'retail',
      'oem',
      'latest model',
      'newest',
      'updated',
      'improved',
      'free shipping',
      'fast shipping',
      'ships fast',
      'limited time',
      'sale',
      'deal',
      'hot deal',
      'bundle',
      'combo',
      'kit',
      'set',
      'international version',
      'us version',
      '\\(.*?warranty.*?\\)',
      'w/free\\s+\\w+',
    ];

    for (const filler of fillerWords) {
      text = text.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }

    text = text.replace(/[|*#@~`]/g, ' ');
    text = text.replace(/(\d+(?:\.\d+)?)"/g, '$1 inch');
    text = text.replace(/(\d+(?:\.\d+)?)'/g, '$1 inch');
    text = text.replace(/\s+/g, ' ').trim().toLowerCase();

    const tokens = text
      .split(/[\s,\-/()[\]{}]+/)
      .filter((token) => token.length > 0);

    const matching = this.matchingText(raw);
    const brand = this.extractBrandFromTitle(matching);
    const model = this.extractModelFromTitle(matching);

    return { raw, normalized: text, tokens, brand, model };
  }

  extractAttributes(
    rawTitle: string,
    rawAttributes: Record<string, unknown> = {},
  ): ExtractedAttributes {
    const result: ExtractedAttributes = { extra: {} };
    const title = this.matchingText(rawTitle);
    const memory = extractMemorySpec(title);

    result.brand = this.extractBrandFromTitle(title) ?? this.extractBrandFromAttributes(rawAttributes);
    result.model = this.extractModelFromTitle(title);
    result.variant = this.extractVariant(title);
    result.storage = this.attributeCapacity(rawAttributes, ['storage', 'hard_drive', 'ssd', 'hdd', 'capacity', 'hard drive']) ?? memory.storage;
    result.ram = this.attributeCapacity(rawAttributes, ['ram', 'memory', 'dram']) ?? memory.ram;
    result.displaySize = this.extractDisplaySize(title, rawAttributes);
    result.cpu = this.extractCpu(title, rawAttributes);
    result.color = this.extractColor(title, rawAttributes);
    result.os = this.extractOs(title, rawAttributes);
    result.generation = this.extractGeneration(title);

    for (const [key, value] of Object.entries(rawAttributes)) {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
      if (!this.isAlreadyExtracted(normalizedKey)) {
        result.extra[normalizedKey] = String(value);
      }
    }

    return result;
  }

  /**
   * Retailer titles almost always lead with the actual brand ("Oppo A6...",
   * "Samsung Galaxy..."), so a startsWith match is checked first and wins
   * outright. Only when nothing matches at the start do we fall back to
   * scanning the rest of the title — and even then we take the leftmost
   * alias hit, not the first one in BRAND_ALIASES' insertion order, so an
   * incidental later mention (a color like "Sapphire Blue", a spec footnote
   * like "Google Play", a compatibility list like "... for Samsung/iPhone")
   * can't outrank a real brand mention earlier in the title.
   */
  private extractBrandFromTitle(title: string): string | undefined {
    const lower = title.toLowerCase();

    for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
      if (lower.startsWith(`${alias} `) || lower === alias) {
        return canonical;
      }
    }

    let bestIndex = -1;
    let bestCanonical: string | undefined;
    for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
      const index = lower.indexOf(` ${alias} `);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
        bestCanonical = canonical;
      }
    }
    return bestCanonical;
  }

  private extractBrandFromAttributes(attrs: Record<string, unknown>): string | undefined {
    const brandKey = Object.keys(attrs).find((key) =>
      ['brand', 'manufacturer', 'vendor'].includes(key.toLowerCase()),
    );

    if (brandKey && typeof attrs[brandKey] === 'string') {
      const raw = (attrs[brandKey] as string).trim();
      return BRAND_ALIASES[raw.toLowerCase()] ?? raw;
    }

    return undefined;
  }

  private extractModelFromTitle(title: string): string | undefined {
    const gpuPatterns = [
      /\b(RTX\s+\d{4}(?:\s+Ti|\s+Super)?)\b/i,
      /\b(GTX\s+\d{4}(?:\s+Ti|\s+Super)?)\b/i,
      /\b(RX\s+\d{4}(?:\s+XT(?:X)?|\s+GRE)?)\b/i,
      /\b(Arc\s+A\d{3})\b/i,
    ];

    for (const pattern of gpuPatterns) {
      const match = pattern.exec(title);
      if (match) return match[1].replace(/\s+/g, ' ').trim();
    }

    const macPattern = /\b(MacBook\s+(?:Pro|Air|Mini)(?:\s+\d{1,2})?)\b/i;
    const macMatch = macPattern.exec(title);
    if (macMatch) return macMatch[1];

    const galaxyPattern = /\b(Galaxy\s+[A-Z]\d+(?:\s+Ultra|\s+Plus|\s+FE)?)\b/i;
    const galaxyMatch = galaxyPattern.exec(title);
    if (galaxyMatch) return galaxyMatch[1];

    // "Samsung A57 5G ..." -- the Galaxy line name left out. Same model as
    // "Galaxy A57", so it is spelled that way.
    const samsungPattern = /\bSamsung\s+([AMSFZ]\d{2,3})(?:\s+(Ultra|Plus|FE))?\b/i;
    const samsungMatch = samsungPattern.exec(title);
    if (samsungMatch) {
      const code = samsungMatch[1].toUpperCase();
      return samsungMatch[2] ? `Galaxy ${code} ${samsungMatch[2]}` : `Galaxy ${code}`;
    }

    // "iPhone 16", "iPhone 16e", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone 17 Air".
    const iphonePattern = /\b(iPhone\s+\d+e?(?:\s+Pro)?(?:\s+(?:Max|Plus|Mini|Air))?)(?![a-z])/i;
    const iphoneMatch = iphonePattern.exec(title);
    if (iphoneMatch) return iphoneMatch[1].trim();

    return this.extractGenericPhoneModel(title);
  }

  /**
   * Retailers reword the same phone completely differently around the model
   * code ("Oppo A6 - 8GB RAM - 256GB - Aurora Gold" vs "OPPO A6 Smartphone,
   * 256 GB, Aurora Gold, Dual SIM, 8 GB RAM, 5G"), which tanks raw text
   * similarity for genuine duplicates. The model code itself — the token
   * immediately after the brand name — stays stable across rewordings, so
   * capturing it here lets the matcher boost real duplicates with confidence
   * instead of relying only on noisy title text or the small local LLM.
   */
  private extractGenericPhoneModel(title: string): string | undefined {
    const lower = title.toLowerCase();

    let matchedAlias: string | undefined;
    let brandEnd = -1;

    for (const alias of GENERIC_MODEL_BRANDS) {
      if (lower.startsWith(`${alias} `)) {
        matchedAlias = alias;
        brandEnd = alias.length;
        break;
      }
    }

    if (!matchedAlias) {
      let bestIndex = -1;
      for (const alias of GENERIC_MODEL_BRANDS) {
        const index = lower.indexOf(` ${alias} `);
        if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
          bestIndex = index;
          matchedAlias = alias;
          brandEnd = index + 1 + alias.length;
        }
      }
    }

    if (!matchedAlias || brandEnd === -1) return undefined;

    const rest = lower.slice(brandEnd);
    const tokens = rest.split(/[\s,\-/()[\]{}:]+/).filter(Boolean);

    // The model is the first token carrying a digit, with up to two
    // product-line words in front of it: "A6", "X9c", "Hot 50", "Redmi Note
    // 14", "Spark 30". Tier words after it (Pro, Max, ...) are the variant
    // guard's business, not part of the model.
    const line: string[] = [];
    let code: string | undefined;
    for (const token of tokens.slice(0, 4)) {
      if (/\d/.test(token)) {
        code = token;
        break;
      }
      if (!/^[a-z]+$/.test(token) || line.length === 2) return undefined;
      line.push(token);
    }
    if (!code) return undefined;

    const letters = code.replace(/[0-9]/g, '');
    if (letters && MODEL_TOKEN_UNIT_SUFFIXES.has(letters)) return undefined;
    if (line.some((word) => GENERIC_MODEL_STOP_WORDS.has(word))) return undefined;

    // Sub-brands sold under a parent brand ("Xiaomi Redmi Note 14" vs "Redmi
    // Note 14") and product lines written with or without a space ("Reno 15"
    // vs "Reno15") must produce one spelling.
    if (SUB_BRAND_PREFIXES.has(matchedAlias)) line.unshift(matchedAlias);
    const model = [...line, code].join(' ');
    return model.replace(/^reno (\d)/, 'reno$1');
  }

  extractVariant(title: string): string | undefined {
    for (const pattern of CRITICAL_VARIANTS) {
      const match = pattern.exec(title);
      if (match) return match[0].trim();
    }
    return undefined;
  }

  /** A capacity the store gave as a structured attribute, normalized ("8 GB" -> "8GB"). */
  private attributeCapacity(attrs: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      if (typeof attrs[key] === 'string') {
        return this.normalizeStorageValue(attrs[key] as string);
      }
    }
    return undefined;
  }

  private extractDisplaySize(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['display', 'screen size', 'screen_size', 'display size']) {
      if (attrs[key]) return String(attrs[key]);
    }

    const match = DISPLAY_PATTERN.exec(title);
    DISPLAY_PATTERN.lastIndex = 0;
    return match ? `${match[1]} inch` : undefined;
  }

  private extractCpu(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['cpu', 'processor', 'chip']) {
      if (attrs[key]) return String(attrs[key]);
    }

    const match = CPU_PATTERN.exec(title);
    CPU_PATTERN.lastIndex = 0;
    return match ? match[1] : undefined;
  }

  private extractColor(title: string, attrs: Record<string, unknown>): string | undefined {
    const colors = [
      // Compound/specific names must come before the generic color words they
      // contain (e.g. "cosmic orange" before "orange"), otherwise two different
      // shades both collapse to the same generic bucket and look identical to
      // the color-conflict guard.
      'cosmic orange',
      'awesome navy',
      'awesome gray',
      'awesome grey',
      'awesome lilac',
      'awesome icyblue',
      'awesome iceblue',
      'icy blue',
      'icyblue',
      'desert titanium',
      'black titanium',
      'white titanium',
      'natural titanium',
      'titanium black',
      'titanium grey',
      'titanium gray',
      'sapphire blue',
      'aurora gold',
      'aurora purple',
      'midnight black',
      'obsidian black',
      'jade cyan',
      'sleek black',
      'cobalt violet',
      'sky blue',
      'deep blue',
      'mist blue',
      'navy blue',
      'baby blue',
      'awesome graphite',
      'awesome violet',
      'awesome black',
      'awesome white',
      'phantom black',
      'phantom violet',
      'phantom white',
      'space gray',
      'space grey',
      'space black',
      'rose gold',
      'jet black',
      'matte black',
      'charcoal',
      'midnight green',
      'alpine green',
      'sage green',
      'black',
      'white',
      'silver',
      'gold',
      'midnight',
      'starlight',
      'blue',
      'red',
      'green',
      'violet',
      'purple',
      'lavender',
      'titanium',
      'natural',
      'graphite',
      'pink',
      'yellow',
      'orange',
      'bronze',
      'coral',
      'mint',
      'sage',
      'burgundy',
      'maroon',
      'beige',
      'cream',
      'navy',
      'teal',
      'olive',
      'gray',
      'grey',
      'lilac',
      'ultramarine',
      'cyan',
    ];

    for (const key of ['color', 'colour']) {
      if (attrs[key]) return String(attrs[key]).toLowerCase();
    }

    const lower = title.toLowerCase();
    // Whole words only: "Redmi" is not red, "Goldfish" is not gold.
    return colors.find((color) => new RegExp(`(?<![a-z])${color}(?![a-z])`).test(lower));
  }

  private extractOs(title: string, attrs: Record<string, unknown>): string | undefined {
    if (attrs.os) return String(attrs.os);

    const patterns = [
      { pattern: /windows\s*11/i, result: 'Windows 11' },
      { pattern: /windows\s*10/i, result: 'Windows 10' },
      { pattern: /\bmac\s*os\b/i, result: 'macOS' },
      { pattern: /\bios\s*\d+/i, result: 'iOS' },
      { pattern: /android\s*\d+/i, result: 'Android' },
      { pattern: /chrome\s*os/i, result: 'ChromeOS' },
    ];

    for (const { pattern, result } of patterns) {
      if (pattern.test(title)) return result;
    }

    return undefined;
  }

  private extractGeneration(title: string): string | undefined {
    const patterns = [
      /\b(\d+)(?:st|nd|rd|th)\s+Gen(?:eration)?\b/i,
      /\bM([123])\s*(?:Pro|Max|Ultra)?\b/i,
      /\b(Gen\s*\d+)\b/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(title);
      if (match) return match[0];
    }

    return undefined;
  }

  private normalizeStorageValue(val: string): string {
    const match = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i.exec(val);
    if (!match) return val.trim();
    return `${match[1]}${match[2].toUpperCase()}`;
  }

  private isAlreadyExtracted(key: string): boolean {
    const extracted = [
      'brand',
      'manufacturer',
      'model',
      'storage',
      'ram',
      'memory',
      'display',
      'screen_size',
      'cpu',
      'processor',
      'color',
      'colour',
      'os',
      'chip',
      'hard_drive',
      'ssd',
      'hdd',
      'capacity',
      'dram',
    ];

    return extracted.includes(key);
  }

  isAccessory(title: string): boolean {
    const accessoryPatterns = [
      /\b(case|cover|sleeve|bag|holster)\b/i,
      /\b(charger|cable|adapter|cord|wire)\b/i,
      /\b(screen protector|tempered glass|film)\b/i,
      /\b(stand|mount|dock|hub|splitter)\b/i,
      /\b(skin|wrap|sticker|decal)\b/i,
      /\b(replacement\s+(?:battery|part|screen))\b/i,
      /\b(compatible with|for use with|fits)\b/i,
      // Spare parts sold under the phone's own name and model number
      // ("Original Lcd C71 for Realme C71 Screen 100% Tested"). The extracted
      // model agrees with the phone's, so without these they merged straight
      // into it and became its "best deal" at a tenth of the price.
      // An "LCD TV" or "LCD Monitor" is the product itself, not a part.
      /\blcds?\b(?!\s*(?:tv|television|monitor|smart))/i,
      /\b(digitizer|display\s+assembly|screen\s+assembly|touch\s+panel|back\s+glass|housing|flex\s+cable)\b/i,
      /\b(camera\s+lens|lens\s+(?:protector|film|cover)|lens\s+guard)\b/i,
      // Arabic-language listings (common on AliExpress/Noon/Jumia for this
      // market) use their own accessory vocabulary — none of the English
      // patterns above match script other than Latin, so these need to be
      // checked separately rather than relying on translation.
      /(واقي|جراب|كفر|غطاء|حافظه|شاحن|كابل|زجاج\s*مقوي|لاصقه|حامل)/,
    ];

    const text = normalizeArabic(this.matchingText(title));
    return accessoryPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * What kind of accessory a title describes, for telling two accessories of
   * the same phone apart (a case is not a screen protector). Null when the
   * title is not an accessory or its kind is not one of these.
   */
  accessoryKind(title: string): string | null {
    const text = normalizeArabic(this.matchingText(title));
    const kinds: Array<[string, RegExp]> = [
      ['screen-protector', /\b(screen\s+protector|tempered\s+glass|screen\s+guard|film)\b|زجاج|لاصقه|واقي\s+شاشه/i],
      ['lens-protector', /\b(camera\s+lens|lens\s+(?:protector|film|cover|guard))\b/i],
      ['case', /\b(case|cover|sleeve|bag|holster|pouch|bumper)\b|جراب|كفر|غطاء|حافظه/i],
      ['charger', /\b(charger|adapter|power\s+bank)\b|شاحن/i],
      ['cable', /\b(cable|cord|wire)\b|كابل/i],
      ['part', /\blcds?\b|\b(digitizer|display\s+assembly|screen\s+assembly|touch\s+panel|back\s+glass|housing|replacement)\b/i],
      ['mount', /\b(stand|mount|dock|holder)\b|حامل/i],
      ['skin', /\b(skin|wrap|sticker|decal)\b/i],
    ];
    const hit = kinds.find(([, pattern]) => pattern.test(text));
    return hit ? hit[0] : null;
  }
}
