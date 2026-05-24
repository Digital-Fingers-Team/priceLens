import { Injectable } from '@nestjs/common';
import { ExtractedAttributes, NormalizedTitle } from './interfaces/matching.interfaces';

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

const STORAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/gi;
const RAM_PATTERNS = [
  /\b(\d+)\s*GB\s*(?:RAM|LPDDR\d*|DDR\d*|SDRAM|Memory)\b/gi,
  /\b(?:RAM|LPDDR\d*|DDR\d*|SDRAM|Memory)\s*(\d+)\s*GB\b/gi,
];
const CPU_PATTERN = /\b(i[3579]-\d{4,5}[A-Z]*|Core\s+i[3579]|Ryzen\s+\d+|M[123]\s+(?:Pro|Max|Ultra)?|Snapdragon\s+\d+)\b/gi;
const DISPLAY_PATTERN = /\b(\d{1,2}(?:\.\d)?)[-\s]?(?:inch|"|in\b|'')/gi;

@Injectable()
export class NormalizerService {
  normalizeTitle(raw: string): NormalizedTitle {
    let text = raw;

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

    const brand = this.extractBrandFromTitle(raw);
    const model = this.extractModelFromTitle(raw);

    return { raw, normalized: text, tokens, brand, model };
  }

  extractAttributes(
    rawTitle: string,
    rawAttributes: Record<string, unknown> = {},
  ): ExtractedAttributes {
    const result: ExtractedAttributes = { extra: {} };

    result.brand = this.extractBrandFromTitle(rawTitle) ?? this.extractBrandFromAttributes(rawAttributes);
    result.model = this.extractModelFromTitle(rawTitle);
    result.variant = this.extractVariant(rawTitle);
    result.storage = this.extractStorage(rawTitle, rawAttributes);
    result.ram = this.extractRam(rawTitle, rawAttributes);
    result.displaySize = this.extractDisplaySize(rawTitle, rawAttributes);
    result.cpu = this.extractCpu(rawTitle, rawAttributes);
    result.color = this.extractColor(rawTitle, rawAttributes);
    result.os = this.extractOs(rawTitle, rawAttributes);
    result.generation = this.extractGeneration(rawTitle);

    for (const [key, value] of Object.entries(rawAttributes)) {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
      if (!this.isAlreadyExtracted(normalizedKey)) {
        result.extra[normalizedKey] = String(value);
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

    const iphonePattern = /\b(iPhone\s+\d+(?:\s+(?:Pro\s+)?(?:Max|Plus|Mini)?)?)\b/i;
    const iphoneMatch = iphonePattern.exec(title);
    if (iphoneMatch) return iphoneMatch[1];

    return undefined;
  }

  extractVariant(title: string): string | undefined {
    for (const pattern of CRITICAL_VARIANTS) {
      const match = pattern.exec(title);
      if (match) return match[0].trim();
    }
    return undefined;
  }

  private extractStorage(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['storage', 'hard_drive', 'ssd', 'hdd', 'capacity', 'hard drive']) {
      if (typeof attrs[key] === 'string') {
        return this.normalizeStorageValue(attrs[key] as string);
      }
    }

    const matches = [...title.matchAll(STORAGE_PATTERN)];
    if (matches.length === 0) return undefined;

    const candidates = matches
      .map((match) => {
        const context = title.slice(Math.max(0, match.index! - 20), match.index! + 20);
        return {
          match,
          isRamContext: /(RAM|LPDDR|DDR|memory)/i.test(context),
          capacity: this.capacityInGb(`${match[1]}${match[2]}`) ?? -1,
        };
      })
      .filter((candidate) => !candidate.isRamContext);

    const ranked = candidates.length > 0
      ? candidates
      : matches.map((match) => ({
          match,
          isRamContext: false,
          capacity: this.capacityInGb(`${match[1]}${match[2]}`) ?? -1,
        }));

    const best = ranked.reduce((current, next) => (next.capacity > current.capacity ? next : current));
    return `${best.match[1]}${best.match[2].toUpperCase()}`;
  }

  private extractRam(title: string, attrs: Record<string, unknown>): string | undefined {
    for (const key of ['ram', 'memory', 'dram']) {
      if (typeof attrs[key] === 'string') {
        return this.normalizeStorageValue(attrs[key] as string);
      }
    }

    for (const pattern of RAM_PATTERNS) {
      const matches = [...title.matchAll(pattern)];
      if (matches.length > 0) {
        return `${matches[0][1]}GB`;
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
      'black',
      'white',
      'silver',
      'gold',
      'space gray',
      'space black',
      'midnight',
      'starlight',
      'blue',
      'red',
      'green',
      'purple',
      'titanium',
      'natural',
      'graphite',
      'rose gold',
      'pink',
      'yellow',
    ];

    for (const key of ['color', 'colour']) {
      if (attrs[key]) return String(attrs[key]).toLowerCase();
    }

    const lower = title.toLowerCase();
    return colors.find((color) => lower.includes(color));
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

  private capacityInGb(val: string): number | null {
    const match = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i.exec(val);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === 'TB') return amount * 1000;
    if (unit === 'MB') return amount / 1000;
    return amount;
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
    ];

    return accessoryPatterns.some((pattern) => pattern.test(title));
  }
}
