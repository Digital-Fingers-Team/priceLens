import { isStoreUrl } from '../../src/affiliate/store-url';

describe('isStoreUrl (S-09)', () => {
  it('accepts the store domain, its subdomains and the connector storefront', () => {
    expect(isStoreUrl('https://ar.aliexpress.com/item/1.html', ['https://www.aliexpress.com'])).toBe(true);
    expect(isStoreUrl('https://www.jumia.com.eg/x.html', ['https://www.jumia.com.eg'])).toBe(true);
    expect(isStoreUrl('https://2b.com.eg/p', ['https://2b.com.eg'])).toBe(true);
    expect(isStoreUrl('https://www.amazon.eg/dp/B0', ['https://www.amazon.com', 'https://www.amazon.eg'])).toBe(true);
  });

  it('refuses other hosts, look-alikes and non-http schemes', () => {
    const noon = ['https://www.noon.com'];
    expect(isStoreUrl('https://evil.example/noon.com', noon)).toBe(false);
    expect(isStoreUrl('https://noon.com.evil.example/', noon)).toBe(false);
    expect(isStoreUrl('https://evilnoon.com/', noon)).toBe(false);
    expect(isStoreUrl('https://www.noon.com@evil.example/', noon)).toBe(false);
    expect(isStoreUrl('javascript:alert(document.cookie)', noon)).toBe(false);
    expect(isStoreUrl('data:text/html,<script>alert(1)</script>', noon)).toBe(false);
    expect(isStoreUrl('//www.noon.com/x', noon)).toBe(false);
    expect(isStoreUrl('https://www.amazon.eg/dp/B0', ['https://www.amazon.com'])).toBe(false);
    expect(isStoreUrl('https://www.noon.com/x', [null, undefined, 'not a url'])).toBe(false);
  });
});
