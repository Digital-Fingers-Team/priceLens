// apps/api/test/unit/fuzzy-matcher.service.spec.ts
import { FuzzyMatcherService } from '../../src/matching/fuzzy-matcher.service';

describe('FuzzyMatcherService', () => {
  let service: FuzzyMatcherService;

  beforeEach(() => {
    service = new FuzzyMatcherService();
  });

  describe('editSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(service.editSimilarity('nvidia rtx 4090', 'nvidia rtx 4090')).toBe(1.0);
    });

    it('returns 0.0 for completely different strings', () => {
      const score = service.editSimilarity('abc', 'xyz');
      expect(score).toBeLessThan(0.5);
    });

    it('handles typos gracefully', () => {
      const score = service.editSimilarity('nvidia rtx 4090', 'nvidia rx 4090');
      expect(score).toBeGreaterThan(0.8);
    });
  });

  describe('jaccardSimilarity', () => {
    it('is 1.0 for identical token sets', () => {
      const tokens = ['nvidia', 'rtx', '4090'];
      expect(service.jaccardSimilarity(tokens, tokens)).toBe(1.0);
    });

    it('is 0.0 for completely different token sets', () => {
      expect(service.jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0);
    });

    it('correctly scores partial overlap', () => {
      const score = service.jaccardSimilarity(
        ['nvidia', 'rtx', '4090'],
        ['nvidia', 'rtx', '4080'],
      );
      // 2 matches out of 4 unique = 0.5
      expect(score).toBeCloseTo(0.5, 1);
    });
  });

  describe('detectVariantConflict', () => {
    it('detects Ti vs non-Ti as a conflict', () => {
      const conflict = service.detectVariantConflict(
        'NVIDIA GeForce RTX 4080 Super',
        'NVIDIA GeForce RTX 4080',
      );
      expect(conflict).not.toBeNull();
    });

    it('detects Pro Max vs Pro as a conflict', () => {
      const conflict = service.detectVariantConflict(
        'iPhone 15 Pro Max',
        'iPhone 15 Pro',
      );
      expect(conflict).not.toBeNull();
    });

    it('returns null for identical variants', () => {
      const conflict = service.detectVariantConflict(
        'NVIDIA RTX 4090 Founders Edition',
        'NVIDIA RTX 4090 FE 24GB',
      );
      expect(conflict).toBeNull();
    });
  });

  describe('detectStorageConflict', () => {
    it('detects 512GB vs 1TB as conflict', () => {
      const conflict = service.detectStorageConflict('512GB', '1TB');
      expect(conflict).toBe('storage_conflict');
    });

    it('1TB and 1000GB are treated as equal', () => {
      const conflict = service.detectStorageConflict('1TB', '1000GB');
      expect(conflict).toBeNull();
    });

    it('returns null if either is missing', () => {
      expect(service.detectStorageConflict(undefined, '512GB')).toBeNull();
    });
  });

  describe('detectChipConflict', () => {
    it('separates Apple chip generations', () => {
      expect(
        service.detectChipConflict(
          'Apple 2025 MacBook Air (13-inch, Apple M4 chip with 10-core CPU and 10-core GPU)',
          'Apple MacBook Air - M5 chip with 10-core CPU and 8-core GPU - 16GB - 512GB SSD',
        ),
      ).toBe('chip_conflict');
      expect(service.detectChipConflict('MacBook Pro M4 Pro 14-inch', 'MacBook Pro M4 Max 14-inch')).toBe('chip_conflict');
    });

    it('separates Intel and AMD tiers', () => {
      expect(service.detectChipConflict('Lenovo IdeaPad 3 Core i5-1235U 8GB', 'Lenovo IdeaPad 3 Core i7-1255U 8GB')).toBe(
        'chip_conflict',
      );
      expect(service.detectChipConflict('ASUS Vivobook Ryzen 5 7520U', 'ASUS Vivobook Ryzen 7 7730U')).toBe('chip_conflict');
    });

    it('passes the same chip worded differently', () => {
      expect(service.detectChipConflict('MacBook Air M4 13-inch 16GB', 'Apple MacBook Air 13" with M4 chip')).toBeNull();
      expect(service.detectChipConflict('HP Laptop Intel Core i7-1355U', 'HP 15 Laptop i7 1355U 16GB')).toBeNull();
    });

    it('stays silent when only one title names a chip', () => {
      expect(service.detectChipConflict('MacBook Air 13-inch 256GB', 'MacBook Air M4 13-inch 256GB')).toBeNull();
    });

    it('compares Intel generations only when both titles give one', () => {
      expect(service.detectChipConflict('Dell Inspiron Core i7 16GB 512GB', 'Dell Inspiron i7-1355U 16GB 512GB')).toBeNull();
    });

    it('does not read an M.2 SSD as an Apple chip', () => {
      expect(service.detectChipConflict('HP Victus Laptop 512GB M2 NVMe SSD', 'HP Victus Laptop 512GB M1 slot SSD')).toBeNull();
    });
  });

  describe('detectProductTypeConflict', () => {
    it('keeps a laptop out of the graphics card its title names', () => {
      // Real false merge: the laptop's GPU model matched the card's, which
      // alone was enough to auto-accept it.
      expect(
        service.detectProductTypeConflict(
          'MSI KATANA 15 HX B14WEK Laptop with 15.6 Inch QHD / Intel Core i7-14650HX / RTX 5050',
          'MSI GeForce RTX 5050 8G Ventus 2X OC Graphics Card',
        ),
      ).toBe('product_type_conflict');
    });

    it('separates earbuds from the phone they share a brand line with', () => {
      expect(
        service.detectProductTypeConflict(
          'Samsung Galaxy Buds3 Pro Wireless Earbuds',
          'Samsung Galaxy S25 Ultra Smartphone 256GB',
        ),
      ).toBe('product_type_conflict');
    });

    it('separates a tablet from a phone', () => {
      expect(
        service.detectProductTypeConflict('Samsung Galaxy Tab A9 Tablet 64GB', 'Samsung Galaxy A06 Smartphone 64GB'),
      ).toBe('product_type_conflict');
    });

    it('does not flag two listings of the same kind', () => {
      expect(
        service.detectProductTypeConflict(
          'ASUS TUF Gaming F15 Laptop, RTX 4060 GPU, 16GB RAM',
          'ASUS TUF Gaming F15 Notebook i7 16GB',
        ),
      ).toBeNull();
      expect(
        service.detectProductTypeConflict(
          'Newest Liquid-Cooled Gaming Rtx 5090 32Gb Gddr7 Graphics Cards Pcie 5.0 Gpu',
          'GPU ROG Astral RTX 5090 32GB GDDR7 Graphics Card Quad Fan',
        ),
      ).toBeNull();
    });

    it('stays silent when a title does not say what it is', () => {
      expect(
        service.detectProductTypeConflict(
          'Samsung Galaxy A56 5G Dual SIM 8GB RAM 256GB - Middle East Version',
          'Samsung Galaxy A56 5G Android Smartphone, 256GB Storage',
        ),
      ).toBeNull();
    });

    it('does not read "headphones" as a phone', () => {
      expect(
        service.detectProductTypeConflict('Sony WH-1000XM5 Wireless Headphones', 'Sony WH-1000XM5 Noise Cancelling Headphones'),
      ).toBeNull();
    });
  });
});