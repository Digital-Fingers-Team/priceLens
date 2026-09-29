import type { Category } from '@prisma/client';
import { categoryTree } from '../../seed/datasets/categoryTree';
import { buildQueriesForCategory, pickCategoryForQuery } from '../../src/scraping/ingestion/search-queries';

/** The real tree as the resolver sees it: leaves only, as the repository returns them. */
const leaves = categoryTree
  .filter((c) => c.level === 1)
  .map(
    (c) =>
      ({ id: c.slug, slug: c.slug, name: c.name, searchTerms: c.searchTerms, level: 1, rolloutWave: c.rolloutWave ?? 0 }) as unknown as Category,
  );

const pick = (query: string) => pickCategoryForQuery(query, leaves)?.slug ?? null;

describe('pickCategoryForQuery against the curated tree', () => {
  it.each([
    ['samsung side by side refrigerator', 'refrigerators'],
    ['LG washing machine 9kg', 'washing-machines'],
    ['sharp split air conditioner 1.5 hp inverter', 'air-conditioners'],
    ['delonghi espresso machine', 'coffee-machines'],
    ['xiaomi electric scooter 4 pro', 'electric-scooters'],
    ['canon mirrorless camera', 'digital-cameras'],
    ['treadmill 2hp', 'treadmills'],
  ])('resolves "%s" to %s', (query, slug) => {
    expect(pick(query)).toBe(slug);
  });

  it('prefers the longest matching term: "baby monitor" is baby gear, not a computer monitor', () => {
    expect(pick('philips baby monitor')).toBe('baby-monitors');
    expect(pick('dell 27 inch monitor')).toBe('monitors');
  });

  it('matches plurals', () => {
    expect(pick('refrigerators')).toBe('refrigerators');
    expect(pick('gaming laptops')).toBe('laptops');
  });

  it('matches whole words, not substrings', () => {
    // "phone" is inside "headphones", "ram" is inside "camera".
    expect(pick('sony headphones')).toBe('headphones');
    expect(pick('camera')).toBe('digital-cameras');
  });

  it('still routes model-family searches to the original categories', () => {
    expect(pick('iphone 16 pro max')).toBe('smartphones');
    expect(pick('galaxy s24 ultra')).toBe('smartphones');
    expect(pick('macbook air m3')).toBe('laptops');
    expect(pick('rtx 4070 super')).toBe('graphics-cards');
    expect(pick('ps5 slim')).toBe('gaming-consoles');
  });

  it('does not let a spec word in a phone or laptop title pick a component category', () => {
    // Review finding I5: bare "ram"/"ssd" terms filed phones and laptops as memory/storage.
    expect(pick('samsung a55 8gb ram')).not.toBe('memory-ram');
    expect(pick('hp victus 16gb ram 512gb ssd')).not.toBe('memory-ram');
    expect(pick('lenovo ideapad 512gb ssd')).not.toBe('ssds-storage');
  });

  it('breaks a length tie toward the lower rollout wave', () => {
    // "iphone" (smartphones, wave 0) and "camera" (digital-cameras, wave 1) are both 6 letters.
    expect(pick('iphone 15 camera')).toBe('smartphones');
  });

  it('resolves Arabic queries', () => {
    expect(pick('ثلاجة شارب')).toBe('refrigerators');
    expect(pick('غسالة اطباق بيكو')).toBe('dishwashers');
    expect(pick('تكييف كاريير')).toBe('air-conditioners');
  });

  it.each([
    // Titles that sat in the old home-appliances catch-all (prod, 2026-09-29).
    ['Beko Dish Washer 14 Persons LED Display Half load', 'dishwashers'],
    ['Philips Dual Basket AirFryer XXL - 2 Basket Drawers', 'air-fryers'],
    ['Black & Decker 4 Liter Fryer - AF400-B5', 'air-fryers'],
    ['BOSCH Series 4 Free-Standing Fridge-Freezer with Freezer at Bottom 505 Liters', 'refrigerators'],
    ['LG Washer 20 Kg And Dryer 11 Kg 1300 Rpm', 'washing-machines'],
    ['Home International 1000W SS Waffel Maker, Multicolor', 'snack-makers'],
    ['Waffle Maker 4 in 1, Multi Plate Cooker 800W with Non-Stick Coating', 'snack-makers'],
    ['Black & Decker Egg Cooker - White, 6 Eggs', 'snack-makers'],
    ['Popcorn Maker - 1200W Household Electric Popcorn Machine', 'snack-makers'],
    ['Castle Quickie Food Chopper – 1.5 Liter, 500W', 'food-processors'],
    ['KENWOOD Food Meat Mincer, Grinder, Kebbe Maker', 'food-processors'],
    ['STARSEEKER EDGE Titanium Burr Coffee Grinder 48MM', 'coffee-machines'],
    ['UNIONAIRE 60cm Built-in Gas Oven/Gas Grill, Fan, Stainless Steel', 'built-in-ovens'],
    ['5-burner stainless steel stove, complete with oven fan, 60*80', 'cookers'],
    ['Professional Wax Heater Temperature Control Adjustable Wax Melting', 'hair-removal'],
    ['KARCHER SE 3 Compact Home Spot Cleaner, 500W Portable Carpet & Upholstery Cleaner', 'vacuum-cleaners'],
    ['Home Cleaning Appliances Multi-functional Electric Floor Cleaner Steam Mop', 'steam-cleaners'],
    ['Kenwood HG230 Electric Health Grill 1500-1700 W - Local Warranty', 'grills'],
    ['Sokany SK-08110 800W Grill Maker, Black', 'grills'],
    ['DITONG X3Plus HD Projector Native 1080P Support 4K WIFI6 Android Mini Portable Projector', 'projectors'],
  ])('files "%s" under %s', (title, slug) => {
    expect(pick(title)).toBe(slug);
  });

  it('does not file by a generic slug word or a bare "desk"', () => {
    expect(pick('Electric Salt and Pepper Grinder Set Automatic Battery Pepper Mill')).not.toBe('grinders');
    expect(pick('6 Pk Magnetic Cord Organizer Holder, Cable Clips, Desk Cable Management')).not.toBe('desks');
    expect(pick('Digital Ultrasonic Cleaner Bath For Jewelry Parts Glasses')).not.toBe('jewelry');
  });

  it('matches -es plurals and Arabic words with the definite article', () => {
    expect(pick('apple watches series 10')).toBe('smart-watches');
    expect(pick('الثلاجة شارب 16 قدم')).toBe('refrigerators');
  });

  it('returns null when nothing matches', () => {
    expect(pick('xyzzy')).toBeNull();
    expect(pickCategoryForQuery('anything', [])).toBeNull();
  });
});

describe('buildQueriesForCategory', () => {
  const refrigerators = leaves.find((c) => c.slug === 'refrigerators')!;

  it('dedupes case- and plural-insensitively and leaves out Arabic terms', () => {
    expect(buildQueriesForCategory(refrigerators)).toEqual(['Refrigerators', 'fridge', 'side by side refrigerator']);
  });
});
