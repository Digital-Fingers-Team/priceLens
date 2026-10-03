import { Prisma } from '@prisma/client';
import { renderPdf, toCsv } from '../../src/brand/export-formats';
import { cheapestPerStore, quoteTotal } from '../../src/procurement/procurement.service';

const listing = (slug: string, price: number | null, inStock: boolean | null = true) => ({
  priceUsd: price == null ? null : new Prisma.Decimal(price),
  inStock,
  externalUrl: `https://${slug}.example/p`,
  platform: { name: slug.toUpperCase(), slug, kind: 'ONLINE' },
});

describe('cheapestPerStore', () => {
  it('keeps one offer per store, the cheapest, sorted ascending', () => {
    const offers = cheapestPerStore([listing('noon', 120), listing('jumia', 100), listing('noon', 110), listing('amazon', null)]);
    expect(offers.map((o) => [o.storeSlug, o.unitPrice])).toEqual([
      ['jumia', 100],
      ['noon', 110],
    ]);
  });

  it('returns nothing for no listings', () => {
    expect(cheapestPerStore([])).toEqual([]);
  });
});

describe('quoteTotal', () => {
  it('multiplies by quantity and skips lines with no offer', () => {
    expect(quoteTotal([{ unitPrice: 100, quantity: 3 }, { unitPrice: null, quantity: 5 }, { unitPrice: 50, quantity: 2 }])).toBe(400);
  });

  it('is null when nothing is priced', () => {
    expect(quoteTotal([{ unitPrice: null, quantity: 1 }])).toBeNull();
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and starts with a BOM', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",');
  });
});

describe('renderPdf', () => {
  it('produces a PDF for English and Arabic content', async () => {
    const pdf = await renderPdf({
      title: 'Quotation: لابتوب',
      facts: [['Total', '1,000 EGP']],
      tables: [
        { title: 'Items', headers: ['#', 'Product'], rows: [[1, 'Lenovo IdeaPad'], [2, 'شاشة سامسونج']] },
        { title: 'Empty', headers: [], rows: [], emptyNote: 'Nothing.' },
      ],
      footer: 'Prices can change.',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
