/**
 * Golden set for the matching pipeline: real-world-shaped store titles, each
 * labelled with the product it truly is (`truth`). Two listings with the same
 * truth are the same sellable product and should end up on one canonical
 * product; different truths must never share one.
 *
 * Colors of one model/storage/RAM share a truth on purpose (owner decision
 * D-6: colors are combined on one product page).
 *
 * The titles follow the formats the stores actually use (Jumia's
 * "256GB/8GB" and "8GB - 256GB", Amazon's "(256 GB)", Noon's "8+256",
 * Arabic titles with Arabic-Indic digits), plus the hard cases the phase 02
 * brief lists: accessories naming the product, refurbished/used, bundles,
 * pack sizes, volumes, display sizes, model years, typos, missing brands and
 * marketing noise.
 *
 * Order matters (products are founded by the first listing of their kind),
 * so the harness runs the set forwards and backwards.
 */

export interface GoldenListing {
  id: string;
  store: string;
  category: string;
  truth: string;
  title: string;
  brand?: string;
  gtin?: string;
}

type Row = [store: string, category: string, truth: string, title: string, extra?: Pick<GoldenListing, 'brand' | 'gtin'>];

const ROWS: Row[] = [
  // ── Samsung Galaxy A57: the F-17 product. RAM variants must never mix. ──
  ['amazon', 'smartphones', 'a57-8-256', 'Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy', { brand: 'Samsung' }],
  ['amazon', 'smartphones', 'a57-12-256', 'Samsung Galaxy A57 5G Dual SIM 256GB 12GB RAM Awesome Gray', { brand: 'Samsung' }],
  ['jumia', 'smartphones', 'a57-8-256', 'Samsung Galaxy A57 5G - 8GB RAM - 256GB - Awesome Navy'],
  ['jumia', 'smartphones', 'a57-8-256', 'Samsung Galaxy A57 5G, 256GB/8GB, Awesome Gray'],
  ['jumia', 'smartphones', 'a57-12-256', 'Samsung Galaxy A57 5G, 256GB/12GB, Awesome Navy'],
  ['jumia', 'smartphones', 'a57-8-256', 'Samsung Galaxy A57 5G 8GB - 256GB - Awesome Lilac'],
  ['jumia', 'smartphones', 'a57-12-256', 'Samsung Galaxy A57 5G 12GB - 256GB - Awesome Icyblue'],
  ['noon', 'smartphones', 'a57-8-256', 'SAMSUNG Galaxy A57 5G (8+256) Icyblue'],
  ['noon', 'smartphones', 'a57-12-256', 'SAMSUNG Galaxy A57 5G (12+256) Awesome Navy'],
  ['2b', 'smartphones', 'a57-8-256', 'Samsung Galaxy A57 5G, 8GB RAM, 256GB, Navy'],
  ['2b', 'smartphones', 'a57-12-256', 'Samsung Galaxy A57 5G 12GB 256GB Lilac'],
  ['elaraby', 'smartphones', 'a57-8-256', 'Samsung A57 5G Smartphone 8GB RAM 256GB Storage Navy'],
  ['amazon', 'smartphones', 'a57-8-256', 'NEW 2025 Samsung Galaxy A57 5G 8GB RAM 256GB Awesome Navy - Official Warranty - Free Shipping'],
  ['noon', 'smartphones', 'a57-8-256', 'سامسونج جالاكسي A57 5G، 256 جيجابايت، رام 8 جيجابايت، أزرق'],
  ['noon', 'smartphones', 'a57-12-256', 'سامسونج جالاكسي A57 رام ١٢ جيجا ذاكرة ٢٥٦ جيجا لون كحلي'],
  ['jumia', 'smartphones', 'a57-8-256', 'Samsng Galaxy A57 8GB 256GB Navy'],
  ['carrefour', 'smartphones', 'a57-8-128', 'Samsung Galaxy A57 5G 128GB 8GB RAM Navy'],
  ['jumia', 'smartphones', 'a57-8-128', 'Samsung Galaxy A57 5G, 128GB/8GB, Awesome Lilac'],
  ['noon', 'smartphones', 'a57-8-128', 'Samsung Galaxy A57 5G 8/128GB Awesome Gray'],
  ['amazon', 'smartphones', 'a57-8-256-renewed', 'Samsung Galaxy A57 5G 256GB 8GB RAM Navy - Renewed'],
  ['amazon', 'smartphones', 'a57-case', 'Silicone Case for Samsung Galaxy A57 5G - Black'],
  ['noon', 'smartphones', 'a57-case-ar', 'جراب سامسونج جالاكسي A57 شفاف'],
  ['jumia', 'smartphones', 'a57-glass', 'Tempered Glass Screen Protector for Samsung Galaxy A57'],
  // RAM missing from the title: after both RAM variants are known, it must not be forced onto either.
  ['amazon', 'smartphones', 'a57-256-ram-unknown', 'Samsung Galaxy A57 5G 256GB Awesome Navy'],
  ['2b', 'smartphones', 'a56-8-256', 'Samsung Galaxy A56 5G 8GB RAM 256GB Awesome Graphite'],

  // ── iPhone 16 family: storage, tier, condition, accessories. ──
  ['amazon', 'smartphones', 'ip16pro-256', 'Apple iPhone 16 Pro 256GB Desert Titanium', { brand: 'Apple' }],
  ['jumia', 'smartphones', 'ip16pro-256', 'Apple iPhone 16 Pro (256 GB) - Black Titanium'],
  ['noon', 'smartphones', 'ip16pro-256', 'iPhone 16 Pro 256GB Natural Titanium'],
  ['2b', 'smartphones', 'ip16pro-256', 'Apple iPhone 16 Pro, 256GB, White Titanium - Physical SIM + eSIM'],
  ['noon', 'smartphones', 'ip16pro-256', 'ايفون 16 برو 256 جيجا تيتانيوم صحراوي'],
  ['amazon', 'smartphones', 'ip16pro-512', 'Apple iPhone 16 Pro 512GB Desert Titanium'],
  ['jumia', 'smartphones', 'ip16pro-512', 'Apple iPhone 16 Pro (512 GB) - Natural Titanium'],
  ['amazon', 'smartphones', 'ip16pro-1tb', 'Apple iPhone 16 Pro 1TB Black Titanium'],
  ['amazon', 'smartphones', 'ip16promax-256', 'Apple iPhone 16 Pro Max 256GB Desert Titanium'],
  ['noon', 'smartphones', 'ip16promax-256', 'iPhone 16 Pro Max (256 GB) - Black Titanium'],
  ['amazon', 'smartphones', 'ip16-128', 'Apple iPhone 16 128GB Black'],
  ['jumia', 'smartphones', 'ip16-128', 'Apple iPhone 16 (128 GB) - Ultramarine'],
  ['alibaba', 'smartphones', 'ip16pro-256-used', 'Apple iPhone 16 Pro 256GB Desert Titanium - Used Excellent Condition'],
  ['amazon', 'smartphones', 'ip16pro-case', 'Clear Case with MagSafe for iPhone 16 Pro'],
  ['noon', 'smartphones', 'ip16pro-glass', 'Tempered Glass Screen Protector for iPhone 16 Pro 256GB'],
  ['amazon', 'smartphones', 'apple-20w', 'Apple 20W USB-C Power Adapter for iPhone 16 Pro'],

  // ── Phone brands without a dedicated model pattern. ──
  ['amazon', 'smartphones', 'oppo-a6-8-256', 'OPPO A6 - 8GB RAM - 256GB - Sapphire Blue'],
  ['jumia', 'smartphones', 'oppo-a6-8-256', 'OPPO A6 Smartphone, 256 GB, Sapphire Blue, Dual SIM, 8 GB RAM, 5G'],
  ['noon', 'smartphones', 'oppo-a6-8-256', 'Oppo A6 8GB+256GB Aurora Gold'],
  ['amazon', 'smartphones', 'oppo-a6-6-128', 'OPPO A6 - 6GB RAM - 128GB - Sapphire Blue'],
  ['noon', 'smartphones', 'oppo-a6-6-128', 'Oppo A6 6+128 Aurora Gold'],
  ['jumia', 'smartphones', 'honor-x9c-12-256', 'Honor X9c 12GB RAM 256GB Titanium Black'],
  ['2b', 'smartphones', 'honor-x9c-12-256', 'Honor X9c 5G Dual SIM 12GB 256GB Black'],
  ['jumia', 'smartphones', 'honor-x9c-12-256', 'HONOR X9c 5G, 256GB/12GB, Jade Cyan'],
  ['noon', 'smartphones', 'honor-x9c-8-256', 'Honor X9c 8GB RAM 256GB Titanium Black'],
  ['amazon', 'smartphones', 'rn14pro-8-256', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black'],
  ['noon', 'smartphones', 'rn14pro-8-256', 'Redmi Note 14 Pro 5G 8GB 256GB Midnight Black'],
  ['jumia', 'smartphones', 'rn14pro-8-256', 'Xiaomi Redmi Note 14 Pro 256GB/8GB Aurora Purple'],
  ['amazon', 'smartphones', 'rn14pro-12-512', 'Xiaomi Redmi Note 14 Pro 12GB RAM 512GB Black'],
  ['jumia', 'smartphones', 'rn14-8-256', 'Xiaomi Redmi Note 14 8GB RAM 256GB Black'],
  ['jumia', 'smartphones', 'rn14pro-8-256-refurb', 'Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black Refurbished'],
  ['amazon', 'smartphones', 'nokia-105-2023', 'Nokia 105 2023 Feature Phone Dual SIM Blue'],
  ['noon', 'smartphones', 'nokia-105-2023', 'Nokia 105 (2023) Dual SIM Charcoal'],
  ['noon', 'smartphones', 'nokia-105-2019', 'Nokia 105 (2019) Dual SIM Black'],
  ['amazon', 'smartphones', 'hot50-8-256', 'Infinix Hot 50 8GB RAM 256GB Sleek Black'],
  ['jumia', 'smartphones', 'hot50-8-256', 'Infinix HOT 50 - 256GB/8GB - Titanium Grey'],
  ['noon', 'smartphones', 'hot50pro-8-256', 'Infinix Hot 50 Pro 8GB+8GB RAM 256GB Titanium Grey'],
  ['noon', 'smartphones', 'realme-c71-lcd', 'Original Lcd C71 for Realme C71 Screen 100% Tested'],
  ['amazon', 'smartphones', 'realme-c71-8-256', 'realme C71 8GB RAM 256GB Obsidian Black'],
  ['2b', 'smartphones', 'realme-c71-8-256', 'Realme C71 Dual SIM 8GB 256GB Black'],

  // ── Laptops: chip, screen size, RAM/SSD pairs, product type. ──
  ['amazon', 'laptops', 'mba13-m4-16-512', 'Apple MacBook Air 13-inch M4 16GB 512GB Midnight'],
  ['jumia', 'laptops', 'mba13-m4-16-512', 'Apple 2025 MacBook Air 13-inch Laptop with M4 chip, 16GB Unified Memory, 512GB SSD Storage - Sky Blue'],
  ['noon', 'laptops', 'mba13-m4-16-256', 'Apple MacBook Air 13-inch M4 16GB 256GB Starlight'],
  ['jumia', 'laptops', 'mba13-m5-16-512', 'Apple MacBook Air 13-inch M5 16GB 512GB Midnight'],
  ['jumia', 'laptops', 'mba15-m4-16-512', 'Apple MacBook Air 15-inch M4 16GB 512GB Midnight'],
  ['amazon', 'laptops', 'mba13-sleeve', 'Laptop Sleeve for MacBook Air 13-inch M4'],
  ['amazon', 'laptops', 'loq15-5050-16-512', 'Lenovo LOQ 15 Gaming Laptop RTX 5050 16GB 512GB'],
  ['jumia', 'laptops', 'loq15-5050-16-512', 'Lenovo LOQ 15 Gaming Laptop, RTX 5050, 16GB RAM, 512GB SSD'],
  ['noon', 'laptops', 'loq15-5050-24-1tb', 'Lenovo LOQ 15 Gaming Laptop RTX 5050 24GB RAM 1TB SSD'],
  ['amazon', 'laptops', 'victus15-i5-4050', 'HP Victus 15 Laptop Intel Core i5 16GB 512GB RTX 4050'],
  ['2b', 'laptops', 'victus15-i5-4050', 'HP Victus 15 Laptop Core i5 16GB RAM 512GB SSD RTX 4050'],
  ['noon', 'laptops', 'victus15-i7-4050', 'HP Victus 15 Laptop Intel Core i7 16GB 512GB RTX 4050'],
  ['noon', 'laptops', 'msi-5050-card', 'MSI GeForce RTX 5050 Ventus 2X 8GB OC Graphics Card'],

  // ── Graphics cards: VRAM and tier. ──
  ['amazon', 'graphics-cards', 'asus-5060ti-16', 'ASUS Dual GeForce RTX 5060 Ti 16GB OC'],
  ['jumia', 'graphics-cards', 'asus-5060ti-16', 'ASUS Dual RTX 5060 Ti 16GB GDDR7 OC Edition'],
  ['2b', 'graphics-cards', 'asus-5060ti-16', 'ASUS Dual GeForce RTX 5060 Ti 16GB OC'],
  ['noon', 'graphics-cards', 'asus-5060ti-8', 'ASUS Dual GeForce RTX 5060 Ti 8GB OC Edition'],
  ['amazon', 'graphics-cards', 'asus-5060-8', 'ASUS Dual GeForce RTX 5060 8GB OC'],
  ['noon', 'graphics-cards', 'giga-5060ti-16', 'Gigabyte RTX 5060 Ti 16GB Gaming OC'],

  // ── Monitors and TVs: display size and model code. ──
  ['amazon', 'monitors', 'lg-24u411', 'LG 24U411A-B 24 inch IPS Monitor'],
  ['noon', 'monitors', 'lg-24u411', 'LG 24U411A-B 24" Full HD Monitor 120Hz'],
  ['jumia', 'monitors', 'lg-27u411', 'LG 27U411A-B 27 inch IPS Monitor'],
  ['amazon', 'tvs', 'sam-u8000f-55', 'Samsung 55 Inch Crystal UHD 4K Smart TV U8000F'],
  ['noon', 'tvs', 'sam-u8000f-55', 'Samsung 55" U8000F Crystal UHD 4K TV'],
  ['jumia', 'tvs', 'sam-u8000f-65', 'Samsung 65 Inch Crystal UHD 4K Smart TV U8000F'],
  ['2b', 'tvs', 'tv-remote', 'Remote Control for Samsung Smart TV'],

  // ── Consoles: bundle vs single. ──
  ['amazon', 'consoles', 'ps5-slim-disc', 'PlayStation 5 Slim Console Disc Edition'],
  ['noon', 'consoles', 'ps5-slim-disc', 'Sony PlayStation 5 Slim Disc Edition Console'],
  ['jumia', 'consoles', 'ps5-slim-disc-fc25', 'PlayStation 5 Slim Disc Console + EA Sports FC 25 Bundle'],
  ['2b', 'consoles', 'ps5-slim-disc-2ctrl', 'PlayStation 5 Slim Disc Console with 2 Controllers Bundle'],

  // ── Groceries and household: volume, weight, pack count. ──
  ['carrefour', 'grocery', 'pepsi-330-1', 'Pepsi Soft Drink Can 330ml'],
  ['amazon', 'grocery', 'pepsi-330-1', 'Pepsi Cola 330 ml Can'],
  ['carrefour', 'grocery', 'pepsi-330-6', 'Pepsi Soft Drink Can 330ml - Pack of 6'],
  ['noon', 'grocery', 'pepsi-330-6', 'Pepsi Cola Can 330ml x 6'],
  ['carrefour', 'grocery', 'pepsi-1l', 'Pepsi Soft Drink Bottle 1L'],
  ['amazon', 'grocery', 'pepsi-1l', 'Pepsi Soft Drink 1 Liter Bottle'],
  ['noon', 'grocery', 'pepsi-500', 'Pepsi Soft Drink Bottle 500ml'],
  ['carrefour', 'grocery', 'persil-2.5l', 'Persil Power Gel Liquid Detergent 2.5L'],
  ['amazon', 'grocery', 'persil-2.5l', 'Persil Power Gel Liquid Detergent 2.5 Liter'],
  ['noon', 'grocery', 'persil-1l', 'Persil Power Gel Liquid Detergent 1L'],
  ['carrefour', 'grocery', 'nescafe-200', 'Nescafe Classic Instant Coffee 200g'],
  ['amazon', 'grocery', 'nescafe-200', 'Nescafe Classic Instant Coffee Jar 200 g'],
  ['noon', 'grocery', 'nescafe-100', 'Nescafe Classic Instant Coffee 100g'],
  ['noon', 'grocery', 'nescafe-200', 'نسكافيه كلاسيك قهوة سريعة التحضير ٢٠٠ جرام'],
];

export const GOLDEN_LISTINGS: GoldenListing[] = ROWS.map(([store, category, truth, title, extra], index) => ({
  id: `g${String(index + 1).padStart(3, '0')}`,
  store,
  category,
  truth,
  title,
  ...extra,
}));

/**
 * Holdout: written after the matcher changes of phase 02 and never used to
 * tune them. Its numbers are reported as they came out, as a check that the
 * golden set above was not simply memorized.
 */
const HOLDOUT_ROWS: Row[] = [
  ['amazon', 'smartphones', 's25u-12-256', 'Samsung Galaxy S25 Ultra 5G 12GB RAM 256GB Titanium Silverblue'],
  ['jumia', 'smartphones', 's25u-12-256', 'Samsung Galaxy S25 Ultra, 256GB/12GB, Titanium Black'],
  ['noon', 'smartphones', 's25u-12-256', 'سامسونج جالاكسي S25 الترا 256 جيجا رام 12 جيجا'],
  ['2b', 'smartphones', 's25u-12-512', 'Samsung Galaxy S25 Ultra 12GB RAM 512GB Titanium Gray'],
  ['amazon', 'smartphones', 's25-12-256', 'Samsung Galaxy S25 5G 12GB 256GB Navy'],
  ['noon', 'smartphones', 's25plus-12-256', 'Samsung Galaxy S25 Plus 12GB RAM 256GB Navy'],
  ['amazon', 'smartphones', 's25u-case', 'Spigen Liquid Air Case for Samsung Galaxy S25 Ultra'],
  ['amazon', 'smartphones', 'r13c-8-256', 'Xiaomi Redmi 13C 8GB RAM 256GB Midnight Black'],
  ['noon', 'smartphones', 'r13c-8-256', 'Redmi 13C 8+256 Navy Blue'],
  ['jumia', 'smartphones', 'r13c-6-128', 'Xiaomi Redmi 13C 6GB RAM 128GB Black'],
  ['amazon', 'smartphones', 'spark30-8-256', 'Tecno Spark 30 8GB RAM 256GB Stellar Shadow'],
  ['jumia', 'smartphones', 'spark30-8-256', 'TECNO SPARK 30 - 256GB/8GB - Orbit White'],
  ['noon', 'smartphones', 'spark30pro-8-256', 'Tecno Spark 30 Pro 8GB RAM 256GB Arctic Glow'],
  ['amazon', 'tablets', 'ipadair11-m2-128', 'Apple iPad Air 11-inch M2 Wi-Fi 128GB Space Grey'],
  ['noon', 'tablets', 'ipadair11-m2-128', 'Apple iPad Air 11 inch (M2) 128GB WiFi Blue'],
  ['jumia', 'tablets', 'ipadair13-m2-128', 'Apple iPad Air 13-inch M2 Wi-Fi 128GB Starlight'],
  ['carrefour', 'grocery', 'pantene-400', 'Pantene Pro-V Smooth Shampoo 400ml'],
  ['amazon', 'grocery', 'pantene-200', 'Pantene Pro-V Smooth Shampoo 200ml'],
  ['carrefour', 'grocery', 'abukass-5kg', 'Abu Kass Basmati Rice 5kg'],
  ['noon', 'grocery', 'abukass-5kg', 'Abu Kass Basmati Rice 5 Kg'],
  ['amazon', 'grocery', 'abukass-1kg', 'Abu Kass Basmati Rice 1kg'],
  ['carrefour', 'grocery', 'nestle-1.5-6', 'Nestle Pure Life Water 1.5L x 6'],
  ['amazon', 'grocery', 'nestle-1.5-6', 'Nestle Pure Life Water 1.5 Liter - Pack of 6'],
  ['noon', 'grocery', 'nestle-600', 'Nestle Pure Life Water 600ml'],
];

export const GOLDEN_HOLDOUT: GoldenListing[] = HOLDOUT_ROWS.map(([store, category, truth, title, extra], index) => ({
  id: `h${String(index + 1).padStart(3, '0')}`,
  store,
  category,
  truth,
  title,
  ...extra,
}));
