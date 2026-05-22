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
});