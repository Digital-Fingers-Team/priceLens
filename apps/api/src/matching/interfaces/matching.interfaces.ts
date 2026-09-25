// apps/api/src/matching/interfaces/matching.interfaces.ts

export interface NormalizedTitle {
  raw: string;
  normalized: string;
  tokens: string[];
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;
}

export interface ExtractedAttributes {
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;          // e.g. "Ti", "Super", "XT", "Plus"
  color?: string;
  storage?: string;          // e.g. "512GB", "1TB"
  ram?: string;              // e.g. "16GB", "32GB"
  cpu?: string;
  gpu?: string;
  displaySize?: string;      // e.g. "14 inch"
  displayResolution?: string;
  connectivity?: string[];   // e.g. ["5G", "Wi-Fi 6E"]
  os?: string;
  generation?: string;       // e.g. "12th Gen", "M3"
  form?: string;             // "Founders Edition", "Gaming OC", etc.
  wattage?: string;
  voltage?: string;
  // Raw key-value for anything we don't explicitly model
  extra: Record<string, string>;
}
