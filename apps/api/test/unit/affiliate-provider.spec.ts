// apps/api/test/unit/affiliate-provider.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AmazonAffiliateProvider } from '../../src/affiliate/providers/amazon-affiliate.provider';
import { JumiaAffiliateProvider } from '../../src/affiliate/providers/jumia-affiliate.provider';
import { NoonAffiliateProvider } from '../../src/affiliate/providers/noon-affiliate.provider';
import { AffiliateProviderRegistry } from '../../src/affiliate/providers/affiliate-provider.registry';
import { AFFILIATE_PROVIDERS } from '../../src/affiliate/affiliate.constants';
import { AffiliateLinkContext, AffiliateProvider } from '../../src/affiliate/interfaces';

const baseContext: AffiliateLinkContext = {
  externalUrl: 'https://www.example-store.com/dp/B0ABC123?ref=sr_1_1&qid=555',
  affiliateId: 'pricelens-21',
  trackingParams: {},
  clickId: 'a1b2c3d4-click-id',
};

describe('AmazonAffiliateProvider', () => {
  let provider: AmazonAffiliateProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AmazonAffiliateProvider],
    }).compile();
    provider = module.get(AmazonAffiliateProvider);
  });

  it('has the amazon store key', () => {
    expect(provider.storeKey).toBe('amazon');
  });

  it('appends the affiliate tag and click sub-tag onto the existing URL', () => {
    const result = new URL(provider.buildAffiliateUrl(baseContext));

    expect(result.origin + result.pathname).toBe('https://www.example-store.com/dp/B0ABC123');
    expect(result.searchParams.get('tag')).toBe('pricelens-21');
    expect(result.searchParams.get('ascsubtag')).toBe('a1b2c3d4-click-id');
  });

  it('preserves the retailer’s own existing query params', () => {
    const result = new URL(provider.buildAffiliateUrl(baseContext));

    expect(result.searchParams.get('ref')).toBe('sr_1_1');
    expect(result.searchParams.get('qid')).toBe('555');
  });

  it('merges operator-configured tracking params', () => {
    const result = new URL(
      provider.buildAffiliateUrl({ ...baseContext, trackingParams: { campaign: 'summer-sale' } }),
    );

    expect(result.searchParams.get('campaign')).toBe('summer-sale');
  });

  it('never lets a colliding tracking param override the computed affiliate tag', () => {
    const result = new URL(
      provider.buildAffiliateUrl({ ...baseContext, trackingParams: { tag: 'operator-mistake' } }),
    );

    expect(result.searchParams.get('tag')).toBe('pricelens-21');
  });
});

describe('NoonAffiliateProvider', () => {
  let provider: NoonAffiliateProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [NoonAffiliateProvider],
    }).compile();
    provider = module.get(NoonAffiliateProvider);
  });

  it('has the noon store key', () => {
    expect(provider.storeKey).toBe('noon');
  });

  it('builds noon-style utm + partner params', () => {
    const context: AffiliateLinkContext = {
      ...baseContext,
      externalUrl: 'https://www.noon.com/egypt-en/product/12345',
    };
    const result = new URL(provider.buildAffiliateUrl(context));

    expect(result.origin + result.pathname).toBe('https://www.noon.com/egypt-en/product/12345');
    expect(result.searchParams.get('partner')).toBe('pricelens-21');
    expect(result.searchParams.get('click_id')).toBe('a1b2c3d4-click-id');
    expect(result.searchParams.get('utm_source')).toBe('pricelens');
    expect(result.searchParams.get('utm_medium')).toBe('affiliate');
  });
});

describe('JumiaAffiliateProvider', () => {
  let provider: JumiaAffiliateProvider;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [JumiaAffiliateProvider],
    }).compile();
    provider = module.get(JumiaAffiliateProvider);
  });

  it('has the jumia store key', () => {
    expect(provider.storeKey).toBe('jumia');
  });

  it('wraps the destination URL in the affiliate network redirector instead of appending params to it', () => {
    const context: AffiliateLinkContext = {
      ...baseContext,
      externalUrl: 'https://www.jumia.com.eg/some-product-12345.html',
    };
    const result = new URL(provider.buildAffiliateUrl(context));

    expect(result.origin + result.pathname).toBe('https://c.jumia.io/deeplink');
    expect(result.searchParams.get('adid')).toBe('pricelens-21');
    expect(result.searchParams.get('subid')).toBe('a1b2c3d4-click-id');
    // The original destination round-trips exactly through the wrapper param.
    expect(result.searchParams.get('url')).toBe('https://www.jumia.com.eg/some-product-12345.html');
  });

  it('merges operator-configured tracking params into the redirector query string', () => {
    const result = new URL(
      provider.buildAffiliateUrl({ ...baseContext, trackingParams: { campaign: 'pricelens-cpa' } }),
    );

    expect(result.searchParams.get('campaign')).toBe('pricelens-cpa');
  });
});

describe('AffiliateProviderRegistry', () => {
  const fakeProvider = (storeKey: string): AffiliateProvider => ({
    storeKey,
    buildAffiliateUrl: (context) => `https://example.com/${storeKey}?clickId=${context.clickId}`,
  });

  let registry: AffiliateProviderRegistry;
  const amazon = fakeProvider('amazon');
  const jumia = fakeProvider('jumia');

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AffiliateProviderRegistry,
        { provide: AFFILIATE_PROVIDERS, useValue: [amazon, jumia] },
      ],
    }).compile();
    registry = module.get(AffiliateProviderRegistry);
  });

  it('resolves a registered provider by store key', () => {
    expect(registry.resolve('amazon')).toBe(amazon);
    expect(registry.resolve('jumia')).toBe(jumia);
  });

  it('reports whether a store key is registered', () => {
    expect(registry.has('amazon')).toBe(true);
    expect(registry.has('unknown-store')).toBe(false);
  });

  it('throws NotFoundException for an unregistered store key', () => {
    expect(() => registry.resolve('unknown-store')).toThrow(NotFoundException);
  });
});
