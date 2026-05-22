// apps/api/test/unit/normalizer.service.spec.ts
import { Test } from '@nestjs/testing';
import { NormalizerService } from '../../src/matching/normalizer.service';

describe('NormalizerService', () => {
  let service: NormalizerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [NormalizerService],
    }).compile();
    service = module.get(NormalizerService);
  });

  describe('normalizeTitle', () => {
    it('strips marketing fluff', () => {
      const result = service.normalizeTitle('BRAND NEW Genuine NVIDIA RTX 4090 Free Shipping Fast');
      expect(result.normalized).not.toContain('brand new');
      expect(result.normalized).not.toContain('free shipping');
      expect(result.normalized).toContain('rtx 4090');
    });

    it('normalizes inch notation', () => {
      const result = service.normalizeTitle('Apple MacBook Pro 14" M3 Pro');
      expect(result.normalized).toContain('14 inch');
    });

    it('lowercases and tokenizes', () => {
      const result = service.normalizeTitle('Samsung Galaxy S24 Ultra');
      expect(result.normalized).toBe('samsung galaxy s24 ultra');
      expect(result.tokens).toContain('samsung');
      expect(result.tokens).toContain('ultra');
    });

    it('extracts brand from known brands', () => {
      const result = service.normalizeTitle('NVIDIA GeForce RTX 4090 Founders Edition');
      expect(result.brand).toBe('NVIDIA');
    });
  });

  describe('extractAttributes', () => {
    it('extracts storage from title', () => {
      const attrs = service.extractAttributes('Apple MacBook Pro 14 512GB SSD M3 Pro');
      expect(attrs.storage).toBe('512GB');
    });

    it('does not confuse RAM with storage', () => {
      const attrs = service.extractAttributes('Laptop 16GB RAM 512GB SSD');
      expect(attrs.ram).toBe('16GB');
      expect(attrs.storage).toBe('512GB');
    });

    it('extracts GPU variants correctly', () => {
      const rtxTi = service.extractAttributes('NVIDIA RTX 4080 Ti Graphics Card');
      expect(rtxTi.variant).toMatch(/Ti/i);

      const rtxSuper = service.extractAttributes('NVIDIA RTX 4080 Super Graphics Card');
      expect(rtxSuper.variant).toMatch(/Super/i);
    });

    it('extracts display size', () => {
      const attrs = service.extractAttributes('Dell XPS 15 15.6-inch Laptop');
      expect(attrs.displaySize).toContain('15.6');
    });
  });

  describe('isAccessory', () => {
    it('correctly flags accessories', () => {
      expect(service.isAccessory('iPhone 15 Pro Case Clear Cover')).toBe(true);
      expect(service.isAccessory('USB-C Charging Cable Compatible with MacBook')).toBe(true);
      expect(service.isAccessory('Screen Protector for Samsung Galaxy S24')).toBe(true);
    });

    it('does not flag actual products', () => {
      expect(service.isAccessory('NVIDIA RTX 4090 24GB GDDR6X')).toBe(false);
      expect(service.isAccessory('Apple MacBook Pro 14 M3 Pro')).toBe(false);
      expect(service.isAccessory('Samsung Galaxy S24 Ultra 256GB')).toBe(false);
    });
  });
});