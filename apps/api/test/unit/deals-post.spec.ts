import { buildPostText, pickForPost } from '../../src/deals/deals-post.service';
import { channelUrl, type PriceDrop } from '../../src/deals/price-drops.service';

function drop(productId: string, categorySlug: string, dropPct = 20): PriceDrop {
  return {
    productId,
    slug: `product-${productId}`,
    title: `Product ${productId}`,
    titleAr: null,
    brand: null,
    imageUrl: null,
    categorySlug,
    listingId: `l-${productId}`,
    store: 'Noon',
    storeSlug: 'noon',
    price: 800,
    usualPrice: 1000,
    dropPct,
    historyDays: 10,
    storeCount: 2,
  };
}

describe('pickForPost', () => {
  it('skips products posted lately and keeps two per category', () => {
    const drops = [drop('a', 'tv'), drop('b', 'tv'), drop('c', 'tv'), drop('d', 'phones'), drop('e', 'phones')];
    const picks = pickForPost(drops, new Set(['d']), 8);
    expect(picks.map((d) => d.productId)).toEqual(['a', 'b', 'e']);
  });

  it('stops at the post size', () => {
    const drops = ['a', 'b', 'c', 'd'].map((id) => drop(id, id));
    expect(pickForPost(drops, new Set(), 3)).toHaveLength(3);
  });
});

describe('buildPostText', () => {
  it('links each drop to its product page and escapes titles', () => {
    const text = buildPostText([{ ...drop('a', 'tv'), titleAr: 'شاشة <4K>' }], 'https://pricelens.store');
    expect(text).toContain('<a href="https://pricelens.store/products/product-a">شاشة &lt;4K&gt;</a>');
    expect(text).toContain('800 ج.م بدل 1,000 ج.م · Noon');
    expect(text).toContain('<b>20%</b>');
  });
});

describe('channelUrl', () => {
  it('links a public @channel and nothing else', () => {
    expect(channelUrl('@pricelens_deals')).toBe('https://t.me/pricelens_deals');
    expect(channelUrl('-1001234567890')).toBeNull();
    expect(channelUrl('')).toBeNull();
  });
});
