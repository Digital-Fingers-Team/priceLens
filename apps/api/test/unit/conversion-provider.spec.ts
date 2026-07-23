// apps/api/test/unit/conversion-provider.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { ImpactConversionProvider } from '../../src/affiliate/providers/impact-conversion.provider';
import { ConversionProviderRegistry } from '../../src/affiliate/providers/conversion-provider.registry';
import { CONVERSION_PROVIDERS } from '../../src/affiliate/affiliate.constants';
import { ConversionProvider } from '../../src/affiliate/interfaces';

describe('ImpactConversionProvider', () => {
  const buildProvider = async (configOverrides: Record<string, unknown> = {}) => {
    const defaults: Record<string, unknown> = {
      'affiliate.impactAccountSid': 'IR-ACCOUNT',
      'affiliate.impactAuthToken': 'secret-token',
      'affiliate.impactBaseUrl': 'https://api.impact.com',
    };
    const values = { ...defaults, ...configOverrides };

    const module = await Test.createTestingModule({
      providers: [
        ImpactConversionProvider,
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => values[key] ?? fallback },
        },
      ],
    }).compile();

    return module.get(ImpactConversionProvider);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has the impact network key', async () => {
    const provider = await buildProvider();
    expect(provider.networkKey).toBe('impact');
  });

  describe('fetchConversions', () => {
    it('returns an empty array when credentials are not configured', async () => {
      const provider = await buildProvider({
        'affiliate.impactAccountSid': '',
        'affiliate.impactAuthToken': '',
      });
      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await provider.fetchConversions(new Date('2026-01-01'));

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('maps a successful Actions API response into RawConversion objects', async () => {
      const provider = await buildProvider();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          Actions: [
            {
              Id: 'action-1',
              Sid: 'a1b2c3d4-click-id',
              State: 'APPROVED',
              Payout: '12.50',
              Amount: '250.00',
              Currency: 'USD',
              EventDate: '2026-07-20T10:00:00Z',
            },
            // Missing Sid -- can't be matched to any click, must be filtered out.
            {
              Id: 'action-2',
              Sid: null,
              State: 'PENDING',
              Payout: '5.00',
              Amount: '100.00',
              Currency: 'USD',
              EventDate: '2026-07-21T10:00:00Z',
            },
          ],
        }),
      } as unknown as Response);

      const result = await provider.fetchConversions(new Date('2026-07-01'));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        externalActionId: 'action-1',
        clickId: 'a1b2c3d4-click-id',
        status: 'APPROVED',
        saleAmount: 250,
        commissionAmount: 12.5,
        currency: 'USD',
        occurredAt: new Date('2026-07-20T10:00:00Z'),
      });
    });

    it('degrades to an empty array (not a throw) when the API call fails', async () => {
      const provider = await buildProvider();
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

      const result = await provider.fetchConversions(new Date('2026-07-01'));

      expect(result).toEqual([]);
    });

    it('maps REVERSED and unknown states correctly', async () => {
      const provider = await buildProvider();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          Actions: [
            { Id: 'a', Sid: 's1', State: 'REVERSED', Payout: '1', Amount: '2', Currency: 'USD', EventDate: '2026-01-01T00:00:00Z' },
            { Id: 'b', Sid: 's2', State: 'LOCKED', Payout: '1', Amount: '2', Currency: 'USD', EventDate: '2026-01-01T00:00:00Z' },
          ],
        }),
      } as unknown as Response);

      const result = await provider.fetchConversions(new Date('2026-01-01'));

      expect(result.find((r) => r.externalActionId === 'a')?.status).toBe('REVERSED');
      expect(result.find((r) => r.externalActionId === 'b')?.status).toBe('PENDING');
    });
  });

  describe('parseWebhookPayload', () => {
    it('parses a well-formed postback payload', async () => {
      const provider = await buildProvider();

      const result = provider.parseWebhookPayload({
        Sid: 'click-abc',
        ActionId: 'action-99',
        State: 'approved',
        Amount: '99.99',
        Payout: '4.50',
        Currency: 'USD',
        EventDate: '2026-07-22T00:00:00Z',
      });

      expect(result).toEqual({
        externalActionId: 'action-99',
        clickId: 'click-abc',
        status: 'APPROVED',
        saleAmount: 99.99,
        commissionAmount: 4.5,
        currency: 'USD',
        occurredAt: new Date('2026-07-22T00:00:00Z'),
      });
    });

    it('falls back to SubId1/Id when Sid/ActionId are absent', async () => {
      const provider = await buildProvider();

      const result = provider.parseWebhookPayload({
        SubId1: 'click-fallback',
        Id: 'action-fallback',
      });

      expect(result?.clickId).toBe('click-fallback');
      expect(result?.externalActionId).toBe('action-fallback');
      expect(result?.status).toBe('PENDING');
    });

    it('returns null when there is no click id or action id to match on', async () => {
      const provider = await buildProvider();

      expect(provider.parseWebhookPayload({ State: 'APPROVED' })).toBeNull();
    });
  });
});

describe('ConversionProviderRegistry', () => {
  const fakeProvider = (networkKey: string): ConversionProvider => ({ networkKey });

  let registry: ConversionProviderRegistry;
  const impact = fakeProvider('impact');

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConversionProviderRegistry,
        { provide: CONVERSION_PROVIDERS, useValue: [impact] },
      ],
    }).compile();
    registry = module.get(ConversionProviderRegistry);
  });

  it('resolves a registered network by key', () => {
    expect(registry.resolve('impact')).toBe(impact);
  });

  it('lists all registered providers', () => {
    expect(registry.all()).toEqual([impact]);
  });

  it('throws NotFoundException for an unregistered network', () => {
    expect(() => registry.resolve('unknown-network')).toThrow(NotFoundException);
  });
});
