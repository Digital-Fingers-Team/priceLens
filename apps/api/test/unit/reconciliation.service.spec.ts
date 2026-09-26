// apps/api/test/unit/reconciliation.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { ReconciliationService } from '../../src/matching/reconciliation.service';
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';
import { NormalizerService } from '../../src/matching/normalizer.service';

type AnyRec = Record<string, any>;

function canonical(overrides: AnyRec = {}): AnyRec {
  return {
    id: overrides.id ?? 'id-' + Math.random().toString(36).slice(2),
    categoryId: 'cat-1',
    slug: 'slug',
    title: 'Samsung Galaxy S26 256GB Sky Blue',
    normalizedTitle: 'samsung galaxy s26 256gb sky blue',
    brand: 'Samsung',
    model: null,
    sku: null,
    gtin: null,
    upc: null,
    ean: null,
    mpn: null,
    attributes: {},
    imageUrl: null,
    thumbnailUrl: null,
    tier: 'MID_RANGE',
    isVerified: false,
    searchBoost: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let semantic: { judgeSameProduct: jest.Mock };

  beforeEach(() => {
    const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
    semantic = { judgeSameProduct: jest.fn() };
    service = new ReconciliationService(
      config,
      {} as any,
      semantic as any,
      new FuzzyMatcherService(),
      new NormalizerService(),
    );
  });

  describe('hasHardConflict', () => {
    const conflict = (a: AnyRec, b: AnyRec) => (service as any).hasHardConflict(a, b);

    it('blocks a merge between two different brands', () => {
      expect(conflict(canonical({ brand: 'Samsung' }), canonical({ brand: 'Apple' }))).toBe(true);
    });

    it('blocks when one title is an accessory and the other is not', () => {
      expect(
        conflict(
          canonical({ title: 'Samsung Galaxy S26' }),
          canonical({ title: 'Samsung Galaxy S26 Case Cover' }),
        ),
      ).toBe(true);
    });

    it('blocks when conflicting GTINs are present', () => {
      expect(
        conflict(canonical({ gtin: '0000000000001' }), canonical({ gtin: '0000000000002' })),
      ).toBe(true);
    });

    it('blocks when storage attributes differ', () => {
      expect(
        conflict(
          canonical({ attributes: { storage: '128GB' } }),
          canonical({ attributes: { storage: '512GB' } }),
        ),
      ).toBe(true);
    });

    it('never treats color as a conflict (D-6)', () => {
      expect(
        conflict(
          canonical({ title: 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Navy' }),
          canonical({ title: 'Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Lilac' }),
        ),
      ).toBe(false);
      expect(
        conflict(
          canonical({ attributes: { color: 'navy' } }),
          canonical({ attributes: { color: 'lilac' } }),
        ),
      ).toBe(false);
    });

    it('blocks different RAM read from Jumia-style titles (F-17)', () => {
      expect(
        conflict(
          canonical({ title: 'Samsung Galaxy A57 5G, 256GB/8GB, Awesome Gray' }),
          canonical({ title: 'Samsung Galaxy A57 5G, 256GB/12GB, Awesome Navy' }),
        ),
      ).toBe(true);
    });

    it('blocks the two merges production made on 2026-09-26', () => {
      expect(
        conflict(
          canonical({ brand: 'OPPO', title: 'OPPO RENO 16F 5G 8 * 256GB POP WHITE (NEW MODEL)' }),
          canonical({ brand: 'OPPO', title: 'OPPO RENO 16F 5G 12 * 256GB TWILIGHT VIOLET (NEW MODEL)' }),
        ),
      ).toBe(true);
      expect(
        conflict(
          canonical({ brand: 'Infinix', title: 'Infinix Hot 60 Pro Dual SIM Sleek Black 8+8GB RAM 256GB 4G' }),
          canonical({ brand: 'Infinix', title: 'Infinix Hot 60 Pro+ Dual SIM Sleek Black 8+8GB RAM 256 GB 4G' }),
        ),
      ).toBe(true);
    });

    it('blocks a product that states its RAM from merging with one that does not', () => {
      expect(
        conflict(
          canonical({ title: 'Samsung Galaxy A57 5G 256GB 8GB RAM Navy' }),
          canonical({ title: 'Samsung Galaxy A57 5G 256GB Navy' }),
        ),
      ).toBe(true);
    });

    it('uses the pipeline guards it used to skip: product type and chip', () => {
      expect(
        conflict(
          canonical({ brand: null, title: 'Lenovo LOQ 15 Gaming Laptop RTX 5050 16GB 512GB' }),
          canonical({ brand: null, title: 'GeForce RTX 5050 8GB Graphics Card' }),
        ),
      ).toBe(true);
      expect(
        conflict(
          canonical({ brand: 'Apple', title: 'Apple MacBook Air 13-inch M4 16GB 512GB' }),
          canonical({ brand: 'Apple', title: 'Apple MacBook Air 13-inch M5 16GB 512GB' }),
        ),
      ).toBe(true);
    });

    it('allows two same-brand listings with no conflicting attributes', () => {
      expect(
        conflict(
          canonical({ title: 'Samsung Galaxy S26 256GB Sky Blue' }),
          canonical({ title: 'Samsung Galaxy S26 - Sky Blue, 256GB, Unlocked' }),
        ),
      ).toBe(false);
    });
  });

  describe('backfillKeeper', () => {
    it('copies a unique identifier the keeper is missing from the loser', async () => {
      const update = jest.fn();
      const tx = { canonicalProduct: { update } } as any;
      const keep = canonical({ id: 'keep', gtin: null, imageUrl: null });
      const merge = canonical({ id: 'merge', gtin: '0000000000009', imageUrl: 'http://img' });

      await (service as any).backfillKeeper(tx, keep, merge);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({
        where: { id: 'keep' },
        data: { gtin: '0000000000009', imageUrl: 'http://img' },
      });
    });

    it('does not overwrite identifiers the keeper already has', async () => {
      const update = jest.fn();
      const tx = { canonicalProduct: { update } } as any;
      const keep = canonical({ id: 'keep', gtin: '0000000000001' });
      const merge = canonical({ id: 'merge', gtin: '0000000000002' });

      await (service as any).backfillKeeper(tx, keep, merge);

      // Nothing to backfill (keeper already has a gtin) → no write at all.
      expect(update).not.toHaveBeenCalled();
    });

    it('merges attribute keys the keeper lacks without clobbering its own', async () => {
      const update = jest.fn();
      const tx = { canonicalProduct: { update } } as any;
      const keep = canonical({ id: 'keep', attributes: { color: 'blue' } });
      const merge = canonical({ id: 'merge', attributes: { color: 'red', ram: '8GB' } });

      await (service as any).backfillKeeper(tx, keep, merge);

      expect(update.mock.calls[0][0].data.attributes).toEqual({ color: 'blue', ram: '8GB' });
    });
  });
});
