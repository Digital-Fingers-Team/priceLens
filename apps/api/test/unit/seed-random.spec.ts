import { SeededRandom } from '../../seed/utils/random';

describe('SeededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRandom('same-seed');
    const b = new SeededRandom('same-seed');

    expect([a.next(), a.next(), a.int(1, 10)]).toEqual([b.next(), b.next(), b.int(1, 10)]);
  });

  it('generates values inside requested bounds', () => {
    const random = new SeededRandom('bounds');

    for (let index = 0; index < 100; index += 1) {
      const value = random.int(5, 8);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(8);
    }
  });
});
