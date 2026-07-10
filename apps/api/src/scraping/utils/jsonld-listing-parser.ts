import { RetailerListing } from '../interfaces/retailer-listing.interface';

/**
 * Parses schema.org Product data out of an HTML document's `<script type="application/ld+json">`
 * tags. Shared by both the plain-HTTP connector and the Playwright (rendered-DOM) connector —
 * the only difference between them is how they obtain `html` (raw fetch vs. page.content()).
 */
export function parseJsonLdListings(
  html: string,
  fallbackUrl: string,
  defaultCurrency: string,
  slug: string,
  limit: number,
): RetailerListing[] {
  const items = extractProductNodes(html);
  const seen = new Set<string>();
  const out: RetailerListing[] = [];

  for (const node of items) {
    const mapped = mapProductNode(node, fallbackUrl, defaultCurrency, slug);
    if (!mapped) continue;
    if (seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
    if (out.length >= Math.max(1, limit)) break;
  }

  return out;
}

function extractProductNodes(html: string): Record<string, unknown>[] {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const candidates: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;

    try {
      const parsed: unknown = JSON.parse(rawJson);
      collectProducts(parsed, candidates);
    } catch {
      continue;
    }
  }

  return candidates;
}

function collectProducts(node: unknown, out: Record<string, unknown>[]) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out);
    return;
  }

  const record = node as Record<string, unknown>;
  const type = normalizeType(record['@type']);
  if (type === 'product') {
    out.push(record);
  }

  if (Array.isArray(record['@graph'])) {
    collectProducts(record['@graph'], out);
  }

  if (record.mainEntity && typeof record.mainEntity === 'object') {
    collectProducts(record.mainEntity, out);
  }

  if (Array.isArray(record.itemListElement)) {
    for (const item of record.itemListElement) {
      if (!item || typeof item !== 'object') continue;
      const listItem = item as Record<string, unknown>;
      collectProducts(listItem.item ?? listItem, out);
    }
  }
}

function mapProductNode(
  node: Record<string, unknown>,
  fallbackUrl: string,
  defaultCurrency: string,
  slug: string,
): RetailerListing | null {
  const title = asString(node.name);
  if (!title) return null;

  const url = asString(node.url) ?? fallbackUrl;
  const externalId =
    asString(node.sku) ??
    asString(node.productID) ??
    asString(node.mpn) ??
    asString(node.gtin13) ??
    asString(node.gtin12) ??
    makeSyntheticId(slug, url, title);

  const offer = resolvePrimaryOffer(node.offers);
  const availability = asString(offer?.availability);
  const aggregateRating = asObject(node.aggregateRating);
  const brand = extractBrand(node.brand);

  return {
    externalId,
    externalUrl: url,
    title,
    priceUsd: asNumber(offer?.price ?? offer?.lowPrice ?? offer?.highPrice),
    currency: asString(offer?.priceCurrency) ?? defaultCurrency,
    brand,
    model: asString(node.model),
    imageUrl: extractImage(node.image),
    inStock:
      availability == null
        ? null
        : availability.toLowerCase().includes('instock') || availability.toLowerCase().includes('in_stock'),
    rating: asNumber(aggregateRating?.ratingValue),
    reviewCount: asInt(aggregateRating?.reviewCount ?? aggregateRating?.ratingCount),
    identifiers: {
      gtin: asString(node.gtin13),
      upc: asString(node.gtin12),
      ean: asString(node.gtin14) ?? asString(node.gtin8),
      mpn: asString(node.mpn),
    },
    raw: node,
  };
}

function resolvePrimaryOffer(offers: unknown): Record<string, unknown> | null {
  if (!offers) return null;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const parsed = asObject(offer);
      if (parsed) return parsed;
    }
    return null;
  }
  return asObject(offers);
}

function extractBrand(brand: unknown): string | null {
  if (typeof brand === 'string') return asString(brand);
  const record = asObject(brand);
  if (!record) return null;
  return asString(record.name) ?? asString(record['@id']);
}

function extractImage(image: unknown): string | null {
  if (typeof image === 'string') return asString(image);
  if (Array.isArray(image)) {
    for (const item of image) {
      const value = extractImage(item);
      if (value) return value;
    }
    return null;
  }
  const record = asObject(image);
  if (!record) return null;
  return asString(record.url) ?? asString(record.contentUrl);
}

function normalizeType(type: unknown): string | null {
  if (typeof type === 'string') return type.trim().toLowerCase();
  if (Array.isArray(type)) {
    for (const item of type) {
      if (typeof item === 'string' && item.trim()) {
        return item.trim().toLowerCase();
      }
    }
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[, ]+/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const numeric = asNumber(value);
  return numeric == null ? null : Math.trunc(numeric);
}

function makeSyntheticId(slug: string, url: string, title: string): string {
  const source = `${slug}:${url}:${title}`.toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `${slug}-${(hash >>> 0).toString(16)}`;
}
