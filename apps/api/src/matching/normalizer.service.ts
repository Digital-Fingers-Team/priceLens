// apps/api/src/matching/normalizer.service.ts
import { Injectable } from '@nestjs/common';
import { NormalizedTitle, ExtractedAttributes } from './interfaces/matching.interfaces';

// Known brand aliases → canonical form
const BRAND_ALIASES: Record<string, string> = {
  'nvidia': 'NVIDIA',
  'geforce': 'NVIDIA',
  'rtx': 'NVIDIA',
  'gtx': 'NVIDIA',
  'amd': 'AMD',
  'radeon': 'AMD',
  'rx': 'AMD',
  'intel': 'Intel',
  'arc': 'Intel',
  'apple': 'Apple',
  'samsung': 'Samsung',
  'lg': 'LG',
  'asus': 'ASUS',
  'asustek': 'ASUS',
  'msi': 'MSI',
  'gigabyte': 'Gigabyte',
  'evga': 'EVGA',
  'zotac': 'ZOTAC',
  'powercolor': 'PowerColor',
  'xfx': 'XFX',
  'sapphire': 'Sapphire',
  'dell': 'Dell',
  'hp': 'HP',
  'hewlett-packard': 'HP',
  'lenovo': 'Lenovo',
  'thinkpad': 'Lenovo',
  'microsoft': 'Microsoft',
  'surface': 'Microsoft',
  'sony': 'Sony',
  'google': 'Google',
  'pixel': 'Google',
  'oneplus': 'OnePlus',
  'motorola': 'Motorola',
  'razer': 'Razer',
  'corsair': 'Corsair',
  'logitech': 'Logitech',
  'kingston': 'Kingston',
  'crucial': 'Crucial',
  'seagate': 'Seagate',
  'western digital': 'Western Digital',
  'wd': 'Western Digital',
};

// GPU variant patterns that MUST NOT be merged (different products)
const CRITICAL_VARIANTS = [
  /\bTi\b/i,
  /\bSuper\b/i,
  /\bXT\b/i,
  /\bXTX\b/i,
  /\bXT X\b/i,
  /\bGRE\b/i,
  /\bPlus\b/i,
  /\bPro\b/i,
  /\bMax\b/i,
  /\bUltra\b/i,
  /\bLite\b/i,
  /\bMini\b/i,
  /\bSE\b/i,
];

// Storage patterns
const STORAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/gi;
const RAM_PATTERN = /\b(\d+)\s*GB\s*(RAM|LPDDR\d*|DDR\d*|SDRAM|Memory)\b/gi;
const CPU_PATTERN = /\b(i[3579]-\d{4,5}[A-Z]*|Core\s+i[3579]|Ryzen\s+\d+|M[123]\s+(?:Pro|Max|Ultra)?|Snapdragon\s+\d+)\b/gi;
const DISPLAY_PATTERN = /\b(\d{1,2}(?:\.\d)?)[-\s]?(?:inch|"|in\b|'')/gi;
const WATTAGE_PATTERN = /\b(\d+)\s*W(?:att)?\b/gi;

@Injectable()
export class NormalizerService {

  /**
   * Step 1: Normalize a raw product title.
   * - Lowercase
   * - Remove filler words (marketing fluff)
   * - Standardize punctuation and spacing
   * - Tokenize
   */
  normalizeTitle(raw: string): NormalizedTitle {
    let text = raw;

    // Strip HTML tags if any sneak in
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Remove marketing filler (keep product-identifying tokens)
    const FILLER_WORDS = [
      'genuine', 'authentic', 'official', 'brand new', 'new',
      'factory sealed', 'sealed', 'retail box', 'retail', 'oem',
      'latest model', 'newest', 'updated', 'improved',
      'free shipping', 'fast shipping', 'ships fast',
      'limited time', 'sale', 'deal', 'hot deal',
      'bundle', 'combo', 'kit', 'set',
      'international version', 'us version',
      '\\(.*?warranty.*?\\)', // "(1 year warranty)"
      'w\\/free\\s+\\w+',    // "w/free case"
    ];

    for (const filler of FILLER_WORDS) {
      text = text.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }

    // Remove standalone noise characters but preserve meaningful ones
    text = text.replace(/[|*#@~`]/g, ' ');

    // Normalize quotes around sizes: 14" → 14 inch
    text = text.replace(/(\d+(?:\.\d+)?)"/, '$1 inch');
    text = text.replace(/(\d+(?:\.\d+)?)'/, "$1 inch");

    // Collapse multiple spaces again after replacements
    text = text.replace(/\s+/g, ' ').trim().toLowerCase();

    const tokens = text
      .split(/[\s,\-\/()[\]{}]+/)
      .filter((t) => t.length > 0);

    // Detect brand from first token or known patterns
    const brand = this.extractBrandFromTitle(raw);
    const model = this.extractModelFromTitle(raw, brand);

    return { raw, normalized: text, tokens, brand, model };
  }

  /**
   * Step 2: Extract structured attributes from raw title + raw attribute map.
   * Returns a rich, typed attribute object that the matching engine uses
   * for variant-safe comparisons.
   */
  extractAttributes(
    rawTitle: string,
    rawAttributes: Record<string, unknown> = {},
  ): ExtractedAttributes {
    const result: ExtractedAttributes = { extra: {} };

    // Brand
    result.brand = this.extractBrandFromTitle(rawTitle)
      ?? this.extractBrandFromAttributes(rawAttributes);

    // Model
    result.model = this.extractModelFromTitle(rawTitle, result.brand);

    // Variant (CRITICAL — different Ti vs non-Ti is a different product)
    result.variant = this.extractVariant(rawTitle);

    // Storage
    result.storage = this.extractStorage(rawTitle, rawAttributes);

    // RAM
    result.ram = this.extractRam(rawTitle, rawAttributes);

    // Display size
    result.displaySize = this.extractDisplaySize(rawTitle, rawAttributes);

    // CPU
    result.cpu = this.extractCpu(rawTitle, rawAttributes);

    // Color
    result.color = this.extractColor(rawTitle, rawAttributes);

    // OS
    result.os = this.extractOs(rawTitle, rawAttributes);

    // Generation
    result.generation = this.extractGeneration(rawTitle, rawAttributes);

    // Copy any remaining raw attributes
    for (const [k, v] of Object.entries(rawAttributes)) {
      const key = k.toLowerCase().replace(/\s+/g, '_');
      if (!this.isAlreadyExtracted(key)) {
        result.extra[key] = String(v);
      }
    }

    return result;
  }

  private extractBrandFromTitle(title: string): string | undefined {
    const lower = title.toLowerCase();
    for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
      if (lower.startsWith(alias) || lower.includes(` ${alias} `)) {
        return canonical;
      }
    }
    return undefined;
  }

  private extractBrandFromAttributes(attrs: Record<string, unknown>): string | undefined {
    const brandKey = Object.keys(attrs).find((k) =>
      ['brand', 'manufacturer', 'vendor'].includes(k.toLowerCase()),
    );
    if (brandKey && typeof attrs[brandKey] === 'string') {
      const raw = (attrs[brandKey] as string).trim();
      return BRAND_ALIASES[raw.toLowerCase()] ?? raw;
    }
    return undefined;
  }

  private extractModelFromTitle(title: string, brand?: string): string | undefined {
    // GPU model patterns: RTX 4090, RX 7900 XTX, Arc A770
    const gpuPatterns = [
      /\b(RTX\s+\d{4}(?:\s+Ti|\s+Super)?)\b/i,
      /\b(GTX\s+\d{4}(?:\s+Ti|\s+Super)?)\b/i,
      /\b(RX\s+\d{4}(?:\s+XT(?:X)?|\s+GRE)?)\b/i,
      /\b(Arc\s+A\d{3})\b/i,
    ];

    for (const pattern of gpuPatterns) {
      const m = pattern.exec(title);
      if (m) return m[1].replace(/\s+/g, ' ').trim();
    }

    // MacBook patterns
    const macPattern = /\b(MacBook\s+(?:Pro|Air|Mini)(?:\s+\d{1,2})?)\b/i;
    const macMatch = macPattern.exec(title);
    if (macMatch) return macMatch[1];

    // Galaxy patterns
    const galaxyPattern = /\b(Galaxy\s+[A-Z]\d+(?:\s+Ultra|\s+Plus|\s+FE)?)\b/i;
    const galaxyMatch = galaxyPattern.exec(title);
    if (galaxyMatch) return galaxyMatch[1];

    // iPhone patterns
    const iphonePattern = /\b(iPhone\s+\d+(?:\s+(?:Pro\s+)?(?:Max|Plus|Mini)?)?)\b/i;
    const iphoneMatch = iphonePattern.exec(title);
    if (iphoneMatch) return iphoneMatch[1];

    return undefined;
  }

  /**
   * Extract product variant — CRITICAL for preventing wrong merges.
   * RTX 4080 ≠ RTX 4080 Super. RX 7900 XT ≠ RX 7900 XTX.
   */
  extractVariant(title: string): string | undefined {
    for (const pattern of CRITICAL_VARIANTS) {
      const m = pattern.exec(title);
      if (m) return m[0].trim();
    }
    return undefined;
  }

  private extractStorage(title: string, attrs: Record<string, unknown>): string | undefined {
    // First check attributes
    for (const key of ['storage', 'hard_drive', 'ssd', 'hdd', 'capacity', 'hard drive']) {
      if (attrs[key] && typeof attrs[key] === 'string') {
        return this.normalizeStorageValue(attrs[key] as string);
      }
    }

    // Extract from title — take the largest value (avoid RAM confusion)
    const matches = [...title.matchAll(STORAGE_PATTERN)];
    if (matches.length === 0) return undefined;

    // If multiple storage values, prefer the one NOT adjacent to RAM keywords
    const storageMatches = matches.filter((m) => {
      const context = title.slice(Math.max(0, m.index! - 20), m.index! + 20);
      return !/(RAM|LPDDR|DDR|memory)/i.test(context);
    });

    const match = storageMatches[0] ?? matches[0];
    return `${match[1]}${match[2].toUpperCase()}`;
  }

  private extractRam(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['ram', 'memory', 'dram']) {
      if (attrs[key] && typeof attrs[key] === 'string') {
        return this.normalizeStorageValue(attrs[key] as string);
      }
    }

    const matches = [...title.matchAll(RAM_PATTERN)];
    if (matches.length > 0) return `${matches[0][1]}GB`;
    return undefined;
  }

  private extractDisplaySize(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['display', 'screen size', 'screen_size', 'display size']) {
      if (attrs[key]) return String(attrs[key]);
    }
    const m = DISPLAY_PATTERN.exec(title);
    DISPLAY_PATTERN.lastIndex = 0;
    return m ? `${m[1]} inch` : undefined;
  }

  private extractCpu(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['cpu', 'processor', 'chip']) {
      if (attrs[key]) return String(attrs[key]);
    }
    const m = CPU_PATTERN.exec(title);
    CPU_PATTERN.lastIndex = 0;
    return m ? m[1] : undefined;
  }

  private extractColor(title: string, attrs: Record<string, unknown>): string | undefined {
    const COLORS = [
      'black', 'white', 'silver', 'gold', 'space gray', 'space black',
      'midnight', 'starlight', 'blue', 'red', 'green', 'purple',
      'titanium', 'natural', 'graphite', 'rose gold', 'pink', 'yellow',
    ];
    for (const key of ['color', 'colour']) {
      if (attrs[key]) return String(attrs[key]).toLowerCase();
    }
    const lower = title.toLowerCase();
    return COLORS.find((c) => lower.includes(c));
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

  private extractGeneration(title: string, attrs: Record<string, unknown>): string | undefined {
    const patterns = [
      /\b(\d+)(?:st|nd|rd|th)\s+Gen(?:eration)?\b/i,
      /\bM([123])\s*(?:Pro|Max|Ultra)?\b/i,
      /\b(Gen\s*\d+)\b/i,
    ];
    for (const pattern of patterns) {
      const m = pattern.exec(title);
      if (m) return m[0];
    }
    return undefined;
  }

  private normalizeStorageValue(val: string): string {
    const m = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i.exec(val);
    if (!m) return val;
    return `${m[1]}${m[2].toUpperCase()}`;
  }

  private isAlreadyExtracted(key: string): boolean {
    const extracted = ['brand', 'manufacturer', 'model', 'storage', 'ram', 'memory',
      'display', 'screen_size', 'cpu', 'processor', 'color', 'colour', 'os', 'chip'];
    return extracted.includes(key);
  }

  /**
   * Detect if a listing is for an accessory, not the main product.
   * Returns true if we should immediately reject this as a candidate.
   */
  isAccessory(title: string): boolean {
    const ACCESSORY_PATTERNS = [
      /\b(case|cover|sleeve|bag|holster)\b/i,
      /\b(charger|cable|adapter|cord|wire)\b/i,
      /\b(screen protector|tempered glass|film)\b/i,
      /\b(stand|mount|dock|hub|splitter)\b/i,
      /\b(skin|wrap|sticker|decal)\b/i,
      /\b(replacement\s+(?:battery|part|screen))\b/i,
      /\b(compatible with|for use with|fits)\b/i,
    ];
    return ACCESSORY_PATTERNS.some((p) => p.test(title));
  }
}