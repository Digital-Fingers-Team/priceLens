import { allowedCorsOrigins, publicSiteUrl } from '../../src/config/site-origins';

describe('site origins (S-02)', () => {
  const prod = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'http://130.110.124.121',
    NEXT_PUBLIC_SITE_URL: 'https://pricelens.work.gd',
  } as NodeJS.ProcessEnv;

  it('allows the site origin even when FRONTEND_URL omits it', () => {
    expect(allowedCorsOrigins(prod).origins).toContain('https://pricelens.work.gd');
    expect(allowedCorsOrigins(prod).origins).toContain('http://130.110.124.121');
  });

  it('does not allow localhost in production', () => {
    expect(allowedCorsOrigins(prod).origins).not.toContain('http://localhost:3000');
    expect(allowedCorsOrigins({ NODE_ENV: 'development' } as NodeJS.ProcessEnv).origins).toContain(
      'http://localhost:3000',
    );
  });

  it('reduces a site URL with a path or trailing slash to its origin', () => {
    const env = { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://example.com/app/' } as NodeJS.ProcessEnv;
    expect(allowedCorsOrigins(env).origins).toEqual(['https://example.com']);
  });

  it('builds outgoing links from the public site URL, not a CORS list', () => {
    expect(publicSiteUrl(prod)).toBe('https://pricelens.work.gd');
    expect(publicSiteUrl({ FRONTEND_URL: 'https://a.test/, https://b.test' } as NodeJS.ProcessEnv)).toBe('https://a.test');
    expect(publicSiteUrl({} as NodeJS.ProcessEnv)).toBe('http://localhost:3000');
  });
});
