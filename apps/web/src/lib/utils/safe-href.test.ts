import { describe, expect, it } from 'vitest';
import { safeExternalHref } from './safe-href';

describe('safeExternalHref', () => {
  it('keeps http(s) store links', () => {
    expect(safeExternalHref('https://www.noon.com/p/1')).toBe('https://www.noon.com/p/1');
    expect(safeExternalHref('http://2b.com.eg/x')).toBe('http://2b.com.eg/x');
  });

  it('drops script and data URLs, relative junk and empty values', () => {
    expect(safeExternalHref('javascript:alert(document.cookie)')).toBeUndefined();
    expect(safeExternalHref(' JavaScript:alert(1)')).toBeUndefined();
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeExternalHref('/relative')).toBeUndefined();
    expect(safeExternalHref(null)).toBeUndefined();
  });
});
