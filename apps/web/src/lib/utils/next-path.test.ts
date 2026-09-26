import { describe, expect, it } from 'vitest';
import { loginHref, safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('accepts same-origin paths, with their query', () => {
    expect(safeNextPath('/products/galaxy-a57?color=navy')).toBe('/products/galaxy-a57?color=navy');
  });

  it('refuses other sites and odd values', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null]) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });

  it('never loops back to the auth pages', () => {
    expect(safeNextPath('/login?next=/x')).toBe('/');
    expect(safeNextPath('/register')).toBe('/');
  });

  it('builds an encoded login link', () => {
    expect(loginHref('/watchlist?x=1')).toBe('/login?next=%2Fwatchlist%3Fx%3D1');
  });
});
