export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number, decimals = 4): number {
    const factor = 10 ** decimals;
    return Math.round((min + this.next() * (max - min)) * factor) / factor;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot pick from an empty array');
    return values[this.int(0, values.length - 1)];
  }

  maybe<T>(values: readonly T[] | undefined, fallback?: T): T | undefined {
    if (!values || values.length === 0) return fallback;
    return this.pick(values);
  }

  fork(suffix: string | number): SeededRandom {
    return new SeededRandom(`${this.state}:${suffix}`);
  }
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function weightedPick<T>(random: SeededRandom, entries: Array<{ value: T; weight: number }>): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random.next() * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}
