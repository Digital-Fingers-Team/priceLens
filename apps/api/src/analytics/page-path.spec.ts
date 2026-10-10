import { deviceOf, isBotUserAgent, parsePagePath, referrerHost } from './page-path';

describe('parsePagePath', () => {
  it('reads Arabic (unprefixed) and English pages', () => {
    expect(parsePagePath('/')).toMatchObject({ route: 'home', locale: 'ar' });
    expect(parsePagePath('/en')).toMatchObject({ route: 'home', locale: 'en' });
    expect(parsePagePath('/en/products/iphone-18-pro')).toMatchObject({
      route: 'product',
      locale: 'en',
      productSlug: 'iphone-18-pro',
    });
    expect(parsePagePath('/categories/washing-machines?page=2')).toMatchObject({
      route: 'category',
      categorySlug: 'washing-machines',
      path: '/categories/washing-machines',
    });
  });

  it('keeps the search text, trimmed', () => {
    expect(parsePagePath('/search?q=%20%D8%A7%D9%8A%D9%81%D9%88%D9%86%20%2018%20')).toMatchObject({
      route: 'search',
      searchQuery: 'ايفون 18',
    });
    expect(parsePagePath('/en/search')).toMatchObject({ route: 'search', searchQuery: null });
  });

  it('does not count admin pages', () => {
    expect(parsePagePath('/admin')).toBeNull();
    expect(parsePagePath('/en/admin/review')).toBeNull();
  });

  it('groups account pages', () => {
    expect(parsePagePath('/watchlist')).toMatchObject({ route: 'account' });
    expect(parsePagePath('/en/login?next=/x')).toMatchObject({ route: 'account' });
    expect(parsePagePath('/deals')).toMatchObject({ route: 'other' });
  });
});

describe('referrerHost', () => {
  it('drops internal and bad referrers', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'pricelens.work.gd')).toBe('google.com');
    expect(referrerHost('https://pricelens.work.gd/en', 'pricelens.work.gd')).toBeNull();
    expect(referrerHost('not a url', 'pricelens.work.gd')).toBeNull();
    expect(referrerHost(undefined, 'pricelens.work.gd')).toBeNull();
  });
});

describe('deviceOf', () => {
  it('tells phones from desktops', () => {
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });
});

describe('isBotUserAgent', () => {
  it('flags crawlers, AI agents, scripts and a missing user agent', () => {
    expect(isBotUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ShapBot/0.1.0')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0')).toBe(true);
    expect(isBotUserAgent('python-requests/2.32')).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent('')).toBe(true);
  });

  it('lets phone and desktop browsers through', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});
