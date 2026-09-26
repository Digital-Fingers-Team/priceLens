/**
 * Variant-defining numbers read from a title: RAM, storage, volume, weight,
 * pack count, model year. Pure functions over the matching text (see
 * toMatchingText), so Arabic titles read the same as English ones.
 *
 * RAM and storage cover every format stores use in this market:
 *   "8GB RAM", "8 GB RAM", "RAM 8GB", "8GB LPDDR5", "16GB Unified Memory"
 *   "256GB/8GB", "8GB/256GB", "8/256GB", "8GB - 256GB", "8GB, 256GB"
 *   "8+256", "(8+256)", "8GB+256GB", "8 * 256GB", "12GB 256GB", "256GB ROM", "512GB SSD"
 *   "رام ٨ جيجا", "٢٥٦ جيجابايت" (after toMatchingText)
 * An unlabelled pair is read as RAM + storage only when the smaller number is
 * a plausible RAM size and the larger a plausible storage size, so a GPU's
 * "16GB" or a "Ventus 2X 8GB" is never mistaken for RAM.
 */

export interface MemorySpec {
  /** e.g. "8GB". Undefined when the title does not say. */
  ram?: string;
  /** e.g. "256GB", "1TB". Undefined when the title does not say. */
  storage?: string;
}

interface Capacity {
  gb: number;
  text: string;
  index: number;
  end: number;
}

const RAM_SIZES = new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 32, 36, 48, 64]);
const STORAGE_SIZES = new Set([16, 32, 64, 128, 256, 512, 1000, 2000, 4000]);

const CAPACITY = /(?<![\w.])(\d+(?:\.\d+)?)\s*(tb|gb)(?![a-z])/gi;

/** "8GB RAM", "8 GB of RAM", "8GB LPDDR5X", "16GB Unified Memory", "8GB DDR4". */
const RAM_AFTER = /(?<![\w.])(\d{1,3})\s*gb\s*(?:of\s+)?(?:ram|lpddr\d*x?|ddr\d*|unified\s+memory|memory)(?![a-z])/gi;
/**
 * "RAM 8GB", "RAM: 8 GB", "Memory 16GB". No dash: stores separate fields
 * with " - " ("8GB RAM - 128GB"), and the next field is not the RAM.
 */
const RAM_BEFORE = /(?<![a-z])(?:ram|memory)\s*:?\s*(\d{1,3})\s*gb(?![a-z])/gi;
/** "256GB SSD", "256 GB ROM", "256GB storage", "256GB internal memory". */
const STORAGE_AFTER =
  /(?<![\w.])(\d+(?:\.\d+)?)\s*(tb|gb)\s*(?:ssd|hdd|emmc|ufs|rom|nvme|storage|internal(?:\s+(?:storage|memory))?|hard\s+drive)(?![a-z])/gi;
/** "Storage 256GB", "ROM: 256 GB", "SSD 512GB". */
const STORAGE_BEFORE = /(?<![a-z])(?:storage|rom|ssd)\s*:?\s*(\d+(?:\.\d+)?)\s*(tb|gb)(?![a-z])/gi;
/** Unit-less pairs: "8+256", "(8+256)", "8/256GB", "8GB+256GB", "12+1TB", "8 * 256GB". */
const PAIR = /(?<![\w.])(\d{1,3})\s*(gb)?\s*([+/*×])\s*(\d{1,4})\s*(gb|tb)?(?![a-z\d])/gi;

function toGb(amount: number, unit: string): number {
  return unit.toLowerCase() === 'tb' ? amount * 1000 : amount;
}

function formatCapacity(gb: number): string {
  return gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000}TB` : `${gb}GB`;
}

function capacities(text: string): Capacity[] {
  return [...text.matchAll(CAPACITY)].map((match) => ({
    gb: toGb(parseFloat(match[1]), match[2]),
    text: match[0],
    index: match.index!,
    end: match.index! + match[0].length,
  }));
}

/** Smaller = RAM, larger = storage, when both are plausible for their role. */
function asRamStoragePair(a: number, b: number): { ram: number; storage: number } | null {
  const ram = Math.min(a, b);
  const storage = Math.max(a, b);
  if (!RAM_SIZES.has(ram) || !STORAGE_SIZES.has(storage) || storage < ram * 4) {
    return null;
  }
  return { ram, storage };
}

export function extractMemorySpec(matchingText: string): MemorySpec {
  const text = matchingText.toLowerCase();
  const spec: { ram?: number; storage?: number } = {};
  const ramPositions: Array<[number, number]> = [];

  // 1. Labelled RAM. "Memory" alone above 64GB is storage talk ("256GB memory").
  for (const pattern of [RAM_AFTER, RAM_BEFORE]) {
    for (const match of text.matchAll(pattern)) {
      const gb = parseInt(match[1], 10);
      const viaMemoryWord = /memory/.test(match[0]) && !/unified/.test(match[0]);
      if (viaMemoryWord && gb > 64) continue;
      if (gb <= 0 || gb > 128) continue;
      spec.ram ??= gb;
      if (gb === spec.ram) ramPositions.push([match.index!, match.index! + match[0].length]);
    }
  }

  // 2. Labelled storage. A number already read as RAM is not storage: in
  // "RAM 12 GB storage 256 GB" the "12 GB storage" is two fields.
  const insideRam = (index: number) => ramPositions.some(([start, end]) => index >= start && index < end);
  for (const pattern of [STORAGE_AFTER, STORAGE_BEFORE]) {
    for (const match of text.matchAll(pattern)) {
      const numberIndex = match.index! + match[0].search(/\d/);
      if (insideRam(numberIndex)) continue;
      spec.storage ??= toGb(parseFloat(match[1]), match[2]);
      break;
    }
  }

  // 3. Unlabelled pairs: "8+256", "256GB/8GB", "8GB - 256GB", "12GB 256GB".
  if (spec.ram === undefined || spec.storage === undefined) {
    const pair = findPair(text);
    if (pair) {
      if (spec.ram === undefined && (spec.storage === undefined || spec.storage === pair.storage)) {
        spec.ram = pair.ram;
        ramPositions.push(...pair.ramPositions);
      }
      spec.storage ??= pair.storage;
    }
  }

  // 4. Otherwise storage is the largest capacity not already read as RAM.
  if (spec.storage === undefined) {
    const others = capacities(text).filter((capacity) => !insideRam(capacity.index));
    if (others.length > 0) {
      spec.storage = others.reduce((best, next) => (next.gb > best.gb ? next : best)).gb;
    }
  }

  return {
    ram: spec.ram !== undefined ? `${spec.ram}GB` : undefined,
    storage: spec.storage !== undefined ? formatCapacity(spec.storage) : undefined,
  };
}

function findPair(text: string): { ram: number; storage: number; ramPositions: Array<[number, number]> } | null {
  for (const match of text.matchAll(PAIR)) {
    const [, first, firstUnit, operator, second, secondUnit] = match;
    // "8/256" or "8 * 256" with no unit anywhere is only a pair with "+", which stores use
    // for exactly this; a bare "a/b" could be anything.
    if (!firstUnit && !secondUnit && operator !== '+') continue;
    const a = toGb(parseInt(first, 10), firstUnit ?? secondUnit ?? 'gb');
    const b = toGb(parseInt(second, 10), secondUnit ?? 'gb');
    const pair = asRamStoragePair(a, b);
    if (pair) {
      return { ...pair, ramPositions: [[match.index!, match.index! + match[0].length]] };
    }
  }

  // Two capacities next to each other, separated only by punctuation.
  const found = capacities(text);
  for (let i = 0; i + 1 < found.length; i += 1) {
    const between = text.slice(found[i].end, found[i + 1].index);
    if (!/^[\s,/|+\-–()]*$/.test(between)) continue;
    const pair = asRamStoragePair(found[i].gb, found[i + 1].gb);
    if (pair) {
      const ramCapacity = found[i].gb === pair.ram ? found[i] : found[i + 1];
      return { ...pair, ramPositions: [[ramCapacity.index, ramCapacity.end]] };
    }
  }
  return null;
}

export interface QuantitySpec {
  /** Volume per unit in millilitres. */
  volumeMl?: number;
  /** Weight per unit in grams. */
  weightG?: number;
  /** Units in the pack; undefined when the title names no pack. */
  packCount?: number;
}

const VOLUME = /(?<![\w.])(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|l|litres?|liters?|ltr)(?![a-z])/gi;
const WEIGHT = /(?<![\w.])(\d+(?:\.\d+)?)\s*(kg|kilograms?|kilo|g|gm|gr|grams?)(?![a-z])/gi;
const PACK_PATTERNS: RegExp[] = [
  /\bpack\s+of\s+(\d{1,3})\b/i,
  /\b(\d{1,3})\s*-?\s*(?:pack|pk|pcs|pieces|count|ct)\b/i,
  /\b(?:pack|pcs)\s*[:x]?\s*(\d{1,3})\b/i,
  /\b(\d{1,2})\s*x\s*\d+(?:\.\d+)?\s*(?:ml|l|g|kg)\b/i,
];
/** "330ml x 6", "1L x 12": a multiplier after a volume or weight. */
const TRAILING_MULTIPLIER = /(?:ml|l|g|kg)\s*[x×*]\s*(\d{1,2})(?![\w.])/i;

export function extractQuantitySpec(matchingText: string): QuantitySpec {
  const text = matchingText.toLowerCase();
  const spec: QuantitySpec = {};

  const volume = VOLUME.exec(text);
  VOLUME.lastIndex = 0;
  if (volume) {
    const amount = parseFloat(volume[1]);
    spec.volumeMl = /^m/.test(volume[2]) ? amount : amount * 1000;
  }

  for (const match of text.matchAll(WEIGHT)) {
    const amount = parseFloat(match[1]);
    const kilo = /^k/.test(match[2]);
    // "5G"/"4G" is a network, not five grams.
    if (!kilo && amount < 10) continue;
    spec.weightG = kilo ? amount * 1000 : amount;
    break;
  }

  if (spec.volumeMl !== undefined || spec.weightG !== undefined) {
    const multiplier = TRAILING_MULTIPLIER.exec(text);
    if (multiplier) spec.packCount = parseInt(multiplier[1], 10);
  }
  if (spec.packCount === undefined) {
    for (const pattern of PACK_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        spec.packCount = parseInt(match[1], 10);
        break;
      }
    }
  }

  return spec;
}

/** A 4-digit model year the title states ("(2023)", "2025 model"). */
export function extractModelYear(matchingText: string): number | undefined {
  const match = /(?<![\w.])(20[1-3]\d)(?![\w.])/.exec(matchingText);
  return match ? parseInt(match[1], 10) : undefined;
}

/** A bundle: the product plus something else sold together. */
export function isBundle(matchingText: string): boolean {
  return (
    /\b(bundle|combo)\b/i.test(matchingText) ||
    /(?:\+|\bwith\b|\bplus\b)\s*(?:\d+\s*)?(?:extra\s+)?(?:games?|controllers?|headsets?)\b/i.test(matchingText)
  );
}
