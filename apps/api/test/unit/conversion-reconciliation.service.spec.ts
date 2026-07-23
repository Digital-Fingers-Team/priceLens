// apps/api/test/unit/conversion-reconciliation.service.spec.ts
import { ConversionReconciliationService } from '../../src/affiliate/conversion-reconciliation.service';
import { ConversionProviderRegistry } from '../../src/affiliate/providers/conversion-provider.registry';
import { ConversionProvider, RawConversion } from '../../src/affiliate/interfaces';

function rawConversion(overrides: Partial<RawConversion> = {}): RawConversion {
  return {
    externalActionId: 'action-1',
    clickId: 'click-1',
    status: 'APPROVED',
    saleAmount: 100,
    commissionAmount: 5,
    currency: 'USD',
    occurredAt: new Date('2026-07-20T00:00:00Z'),
    ...overrides,
  };
}

describe('ConversionReconciliationService', () => {
  let prisma: {
    affiliateClick: { findUnique: jest.Mock };
    affiliateConversion: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let registry: { all: jest.Mock; resolve: jest.Mock };
  let service: ConversionReconciliationService;

  beforeEach(() => {
    prisma = {
      affiliateClick: { findUnique: jest.fn().mockResolvedValue({ id: 'click-1' }) },
      affiliateConversion: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    registry = { all: jest.fn().mockReturnValue([]), resolve: jest.fn() };
    service = new ConversionReconciliationService(
      prisma as any,
      registry as unknown as ConversionProviderRegistry,
    );
  });

  describe('pollAll', () => {
    it('skips providers that do not support polling', async () => {
      const nonPollable: ConversionProvider = { networkKey: 'no-poll' };
      registry.all.mockReturnValue([nonPollable]);

      const results = await service.pollAll();

      expect(results).toEqual([]);
    });

    it('fetches, reconciles, and reports counts per network', async () => {
      const fetchConversions = jest.fn().mockResolvedValue([rawConversion(), rawConversion({ externalActionId: 'action-2' })]);
      registry.all.mockReturnValue([{ networkKey: 'impact', fetchConversions }]);

      const results = await service.pollAll();

      expect(fetchConversions).toHaveBeenCalledWith(expect.any(Date));
      expect(results).toEqual([{ networkKey: 'impact', fetched: 2, reconciled: 2 }]);
      expect(prisma.affiliateConversion.upsert).toHaveBeenCalledTimes(2);
    });

    it('looks back 30 days when a network has no prior conversions recorded', async () => {
      const fetchConversions = jest.fn().mockResolvedValue([]);
      registry.all.mockReturnValue([{ networkKey: 'impact', fetchConversions }]);
      prisma.affiliateConversion.findFirst.mockResolvedValue(null);

      const before = Date.now();
      await service.pollAll();
      const since = fetchConversions.mock.calls[0][0] as Date;

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(before - since.getTime()).toBeGreaterThanOrEqual(thirtyDaysMs - 1000);
    });

    it('uses the most recent conversion time as the watermark when one exists', async () => {
      const fetchConversions = jest.fn().mockResolvedValue([]);
      registry.all.mockReturnValue([{ networkKey: 'impact', fetchConversions }]);
      const lastSeen = new Date('2026-07-01T00:00:00Z');
      prisma.affiliateConversion.findFirst.mockResolvedValue({ occurredAt: lastSeen });

      await service.pollAll();

      expect(fetchConversions).toHaveBeenCalledWith(lastSeen);
    });
  });

  describe('reconcileOne (via pollAll)', () => {
    it('skips a conversion whose click_id matches no AffiliateClick', async () => {
      prisma.affiliateClick.findUnique.mockResolvedValue(null);
      const fetchConversions = jest.fn().mockResolvedValue([rawConversion({ clickId: 'does-not-exist' })]);
      registry.all.mockReturnValue([{ networkKey: 'impact', fetchConversions }]);

      const results = await service.pollAll();

      expect(results).toEqual([{ networkKey: 'impact', fetched: 1, reconciled: 0 }]);
      expect(prisma.affiliateConversion.upsert).not.toHaveBeenCalled();
    });

    it('upserts keyed on (networkKey, externalActionId) so re-polling the same action is idempotent', async () => {
      const fetchConversions = jest.fn().mockResolvedValue([rawConversion()]);
      registry.all.mockReturnValue([{ networkKey: 'impact', fetchConversions }]);

      await service.pollAll();

      expect(prisma.affiliateConversion.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { networkKey_externalActionId: { networkKey: 'impact', externalActionId: 'action-1' } },
        }),
      );
    });
  });

  describe('handleWebhook', () => {
    it('reconciles a parsed webhook payload', async () => {
      const parseWebhookPayload = jest.fn().mockReturnValue(rawConversion());
      registry.resolve.mockReturnValue({ networkKey: 'impact', parseWebhookPayload });

      const reconciled = await service.handleWebhook('impact', { Sid: 'click-1' });

      expect(reconciled).toBe(true);
      expect(prisma.affiliateConversion.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns false without upserting when the payload cannot be parsed', async () => {
      const parseWebhookPayload = jest.fn().mockReturnValue(null);
      registry.resolve.mockReturnValue({ networkKey: 'impact', parseWebhookPayload });

      const reconciled = await service.handleWebhook('impact', {});

      expect(reconciled).toBe(false);
      expect(prisma.affiliateConversion.upsert).not.toHaveBeenCalled();
    });

    it('throws when the resolved network does not support webhooks', async () => {
      registry.resolve.mockReturnValue({ networkKey: 'impact' });

      await expect(service.handleWebhook('impact', {})).rejects.toThrow(
        'Network "impact" does not support webhook postbacks',
      );
    });
  });

  describe('summary', () => {
    it('maps grouped rows into the summary shape', async () => {
      prisma.affiliateConversion.groupBy.mockResolvedValue([
        { status: 'APPROVED', _sum: { commissionAmount: 42.5 }, _count: { _all: 3 } },
        { status: 'PENDING', _sum: { commissionAmount: null }, _count: { _all: 1 } },
      ]);

      const result = await service.summary();

      expect(result).toEqual([
        { status: 'APPROVED', count: 3, totalCommission: 42.5 },
        { status: 'PENDING', count: 1, totalCommission: null },
      ]);
    });
  });
});
