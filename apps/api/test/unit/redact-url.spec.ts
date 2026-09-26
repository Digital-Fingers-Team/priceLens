import { redactUrl } from '../../src/common/redact-url';

describe('redactUrl (S-11)', () => {
  it('hides credential query values and keeps the rest', () => {
    expect(redactUrl('/api/v1/affiliate/conversions/webhook/impact?secret=s3cr3t&clickId=abc')).toBe(
      '/api/v1/affiliate/conversions/webhook/impact?secret=[redacted]&clickId=abc',
    );
    expect(redactUrl('/x?Token=a&api%5Fkey=b&q=phone')).toBe('/x?Token=[redacted]&api%5Fkey=[redacted]&q=phone');
  });

  it('leaves URLs without credentials untouched', () => {
    expect(redactUrl('/api/v1/search?q=iphone&limit=8')).toBe('/api/v1/search?q=iphone&limit=8');
    expect(redactUrl('/health')).toBe('/health');
  });
});
