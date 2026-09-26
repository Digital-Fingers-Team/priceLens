import { planVariantSplit } from '../../src/matching/repair/variant-repair';

// The Galaxy A57 product as it was in production (audit 00 F-17).
const A57 = [
  ['amz-1', 'Samsung Galaxy A57 5G Android Smartphone, 256GB Storage, 8GB RAM, 6x OS Upgrades, Large Display, 50M'],
  ['amz-2', 'Samsung Galaxy A57 5G Android Smartphone, 256GB Storage, 8GB RAM, 6x OS Upgrades, Large Display, 50M'],
  ['jum-1', 'Galaxy A57 Dual SIM 5G 256GB/8GB - Awesome Navy'],
  ['jum-2', 'Galaxy A57 Dual SIM 5G 8GB - 256GB - Awesome Gray'],
  ['noon-1', 'Samsung Galaxy A57 Dual SIM Awesome Gray 8GB RAM 256GB 5G - Middle East Version'],
  ['noon-2', 'Samsung Galaxy A57 Dual SIM Awesome Navy 12GB RAM 256GB 5G - Middle East Version'],
  ['jum-3', 'Galaxy A57 Dual SIM 5G 256GB/12GB - Awesome Gray'],
  ['amz-3', 'Samsung Galaxy A57 5G Android Smartphone, 256GB Storage, 12GB RAM, 6x OS Upgrades, Large Display, 50'],
  ['2b-1', 'Samsung Galaxy A57 5G - 12GB RAM - 256GB - Gray'],
  ['2b-2', 'Samsung Galaxy A57 5G - 12GB RAM - 256GB - Light Blue'],
  ['noon-3', 'Samsung Galaxy A57 Dual SIM Awesome Lilac 12GB RAM 256GB 5G - Middle East Version'],
].map(([id, rawTitle]) => ({ id, rawTitle }));

describe('planVariantSplit', () => {
  it('splits the A57: RAM varies, the larger group stays, the other becomes its own product', () => {
    const plan = planVariantSplit(A57)!;
    expect(plan.varying).toEqual(['ram']);
    expect(plan.keep.variant).toEqual({ ram: '12GB' });
    expect(plan.keep.listingIds.sort()).toEqual(['2b-1', '2b-2', 'amz-3', 'jum-3', 'noon-2', 'noon-3']);
    expect(plan.splits).toHaveLength(1);
    expect(plan.splits[0].variant).toEqual({ ram: '8GB' });
    expect(plan.splits[0].listingIds.sort()).toEqual(['amz-1', 'amz-2', 'jum-1', 'jum-2', 'noon-1']);
    expect(plan.unknown).toEqual([]);
  });

  it('leaves a product alone when its listings agree', () => {
    expect(planVariantSplit(A57.filter((l) => ['2b-1', '2b-2', 'noon-2'].includes(l.id)))).toBeNull();
  });

  it('never splits by color (D-6)', () => {
    expect(
      planVariantSplit([
        { id: 'a', rawTitle: 'Galaxy A57 8GB RAM 256GB Awesome Navy' },
        { id: 'b', rawTitle: 'Galaxy A57 8GB RAM 256GB Awesome Lilac' },
      ]),
    ).toBeNull();
  });

  it('leaves listings that do not state the varying dimension where they are', () => {
    const plan = planVariantSplit([
      { id: 'a', rawTitle: 'Galaxy A57 8GB RAM 256GB' },
      { id: 'b', rawTitle: 'Galaxy A57 8GB RAM 256GB Navy' },
      { id: 'c', rawTitle: 'Galaxy A57 12GB RAM 256GB' },
      { id: 'd', rawTitle: 'Samsung Galaxy A57 5G' },
    ])!;
    expect(plan.keep.listingIds).toEqual(['a', 'b']);
    expect(plan.splits[0].listingIds).toEqual(['c']);
    expect(plan.unknown).toEqual(['d']);
  });

  it('splits on storage too', () => {
    const plan = planVariantSplit([
      { id: 'a', rawTitle: 'iPhone 15 128GB Black' },
      { id: 'b', rawTitle: 'iPhone 15 256GB Black' },
    ])!;
    expect(plan.varying).toEqual(['storage']);
    expect([plan.keep, ...plan.splits].map((g) => g.variant.storage).sort()).toEqual(['128GB', '256GB']);
  });

  it('plans the same way regardless of listing order', () => {
    const forward = planVariantSplit(A57)!;
    const reversed = planVariantSplit([...A57].reverse())!;
    expect(reversed.keep.variant).toEqual(forward.keep.variant);
    expect(reversed.splits.map((s) => s.variant)).toEqual(forward.splits.map((s) => s.variant));
  });
});
