import { Prisma } from '@prisma/client';
import { SellerToolsService } from '../../src/seller-tools/seller-tools.service';

// The seeded fee tables are per category with no platform default. A store
// without a table for the product's category used to crash profit and
// best-platform with a 500 (2026-10-09).
const table = (platformId: string, categoryKey: string, commissionPct: number, brand = '') => ({
  id: `${platformId}-${categoryKey}-${brand}`,
  platformId,
  categoryKey,
  brand,
  commissionPct,
  fixedFee: new Prisma.Decimal(0),
  shippingFee: new Prisma.Decimal(0),
  returnRatePct: 0,
  vatPct: 0,
  tierUpTo: null,
  commissionPctAbove: null,
  tierWholePrice: false,
  minCommission: new Prisma.Decimal(0),
  notes: null,
  updatedAt: new Date('2026-10-03T00:00:00Z'),
  platform: { id: platformId, name: platformId },
});

function service(categorySlug: string | null, brand: string | null = null, tables = [table('jumia', 'headphones', 10), table('amazon', 'laptops', 8)]) {
  const prisma = {
    sellerProduct: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p1',
        cost: new Prisma.Decimal(900),
        currentPrice: new Prisma.Decimal(1300),
        canonicalProductId: categorySlug ? 'c1' : null,
        canonicalProduct: categorySlug ? { id: 'c1', title: 'Buds', brand, category: { slug: categorySlug } } : null,
      }),
    },
    platformFeeTable: {
      findMany: jest.fn().mockResolvedValue(tables),
    },
  };
  const organizations = { requireMembership: jest.fn().mockResolvedValue({ organization: { id: 'o1' } }) };
  const products = { getCompetitorPrices: jest.fn().mockResolvedValue(new Map([['c1', [{ platformId: 'jumia', price: 1250 }]]])) };
  return new SellerToolsService(prisma as never, organizations as never, products as never, {} as never);
}

describe('SellerToolsService fee lookup', () => {
  it('profit lists only stores with fees for the category', async () => {
    const result = await service('headphones').profit('u1', 'o1', 'p1');
    expect(result.rows.map((r) => r.platform.id)).toEqual(['jumia']);
  });

  it('best platform lists only stores with fees for the category', async () => {
    const result = await service('headphones').bestPlatform('u1', 'o1', 'p1');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ platform: { id: 'jumia' }, marketPrice: 1250, priceSource: 'MARKET' });
  });

  it('a brand row wins over the category row, matched without case', async () => {
    const tables = [table('noon', 'headphones', 15), table('noon', 'headphones', 8, 'huawei')];
    const huawei = await service('headphones', 'Huawei', tables).profit('u1', 'o1', 'p1');
    expect(huawei.rows.map((r) => r.fees.commissionPct)).toEqual([8]);
    const other = await service('headphones', 'Lenovo', tables).profit('u1', 'o1', 'p1');
    expect(other.rows.map((r) => r.fees.commissionPct)).toEqual([15]);
  });

  it('an unlinked product gets no rows instead of an error', async () => {
    await expect(service(null).profit('u1', 'o1', 'p1')).resolves.toMatchObject({ rows: [] });
    await expect(service(null).bestPlatform('u1', 'o1', 'p1')).resolves.toMatchObject({ rows: [] });
  });
});
