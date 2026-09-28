import type { Category } from '@prisma/client';
import { categoryTree } from '../../seed/datasets/categoryTree';
import { planRecategorization } from '../../src/scraping/ingestion/recategorize';

const leaves = categoryTree
  .filter((c) => c.level === 1)
  .map((c) => ({ id: `id-${c.slug}`, slug: c.slug, name: c.name, searchTerms: c.searchTerms, level: 1, rolloutWave: c.rolloutWave ?? 0 }) as unknown as Category);
const targets = leaves.filter((c) => (c.rolloutWave ?? 0) >= 1);
const from = 'id-home-appliances';

describe('planRecategorization', () => {
  const products = [
    { id: 'p1', title: 'Beko No Frost Refrigerator 450 Liters Silver', categoryId: from },
    { id: 'p2', title: 'LG Front Load Washer 9kg Inverter', categoryId: from },
    { id: 'p3', title: 'Philips Air Fryer XXL 7.3L', categoryId: from },
    { id: 'p4', title: 'Bosch Serie 4 Dishwasher 60cm', categoryId: from },
    { id: 'p5', title: 'Mystery Gadget 3000', categoryId: from },
  ];

  it('moves each product to the leaf its title resolves to, and leaves the rest', () => {
    const plan = planRecategorization(products, targets);
    expect(plan.map((move) => [move.productId, move.toSlug])).toEqual([
      ['p1', 'refrigerators'],
      ['p2', 'washing-machines'],
      ['p3', 'air-fryers'],
      ['p4', 'dishwashers'],
    ]);
    expect(plan.every((move) => move.fromCategoryId === from)).toBe(true);
  });

  it('never "moves" a product to the category it is already in', () => {
    const plan = planRecategorization([{ id: 'p1', title: 'Beko refrigerator', categoryId: 'id-refrigerators' }], targets);
    expect(plan).toEqual([]);
  });
});
