import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './json-ld';

const LINE_SEPARATORS = String.fromCharCode(0x2028, 0x2029);

describe('serializeJsonLd', () => {
  const hostile = `Phone </script><script>alert(document.cookie)</script> & <!-- ${LINE_SEPARATORS}`;

  it('never emits a character that can end the script tag', () => {
    const out = serializeJsonLd({ name: hostile });
    expect(out).not.toMatch(new RegExp(`[<>&${LINE_SEPARATORS}]`));
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('round-trips to the same data', () => {
    const data = { '@type': 'Product', name: hostile, offers: { lowPrice: 10 } };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
