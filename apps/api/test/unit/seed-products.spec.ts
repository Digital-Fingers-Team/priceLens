import { loadSeedConfig } from '../../seed/config';
import { buildProductSeeds } from '../../seed/generators/generateProducts';

describe('product seed generation', () => {
  it('builds structured demo products without random fake titles', () => {
    const config = loadSeedConfig({ SEED_PROFILE: 'demo', SEED_PRODUCT_TARGET: '25' } as NodeJS.ProcessEnv);
    const categoryIds = new Map([
      ['smartphones', 'cat-phone'],
      ['laptops', 'cat-laptop'],
      ['graphics-cards', 'cat-gpu'],
      ['processors', 'cat-cpu'],
      ['monitors', 'cat-monitor'],
      ['televisions', 'cat-tv'],
      ['headphones', 'cat-headphones'],
      ['tablets', 'cat-tablets'],
      ['smart-watches', 'cat-watches'],
      ['gaming-consoles', 'cat-consoles'],
      ['home-appliances', 'cat-appliances'],
    ]);

    const products = buildProductSeeds(config, categoryIds);

    expect(products).toHaveLength(25);
    expect(products[0].title).toContain('Apple');
    expect(products.every((product) => product.attributes.releaseYear)).toBe(true);
    expect(new Set(products.map((product) => product.slug)).size).toBe(products.length);
  });
});
