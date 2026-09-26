import {
  englishEquivalents,
  normalizeArabic,
  normalizeDigits,
  toMatchingText,
} from '../../src/matching/text/arabic';
import {
  extractMemorySpec,
  extractModelYear,
  extractQuantitySpec,
  isBundle,
} from '../../src/matching/text/specs';

const memory = (title: string) => extractMemorySpec(toMatchingText(title));

describe('matching text', () => {
  describe('RAM and storage extraction (F-17)', () => {
    it.each([
      // Labelled.
      ['Samsung Galaxy A57 5G Dual SIM 256GB 8GB RAM Awesome Navy', '8GB', '256GB'],
      ['OPPO A6 Smartphone, 256 GB, Sapphire Blue, Dual SIM, 8 GB RAM, 5G', '8GB', '256GB'],
      ['OPPO A6 - 6GB RAM - 128GB - Sapphire Blue', '6GB', '128GB'],
      ['Samsung Galaxy A57 RAM 12GB 256GB Storage', '12GB', '256GB'],
      ['Honor X9c RAM: 12 GB, ROM: 256 GB', '12GB', '256GB'],
      ['Apple MacBook Air 13-inch Laptop with M4 chip, 16GB Unified Memory, 512GB SSD Storage', '16GB', '512GB'],
      ['Lenovo LOQ 15 Gaming Laptop RTX 5050 24GB RAM 1TB SSD', '24GB', '1TB'],
      ['ASUS Vivobook 16GB LPDDR5X 512GB SSD', '16GB', '512GB'],
      ['Infinix Hot 50 Pro 8GB+8GB RAM 256GB Titanium Grey', '8GB', '256GB'],
      // Unlabelled pairs, both orders, every separator stores use.
      ['Samsung Galaxy A57 5G, 256GB/8GB, Awesome Gray', '8GB', '256GB'],
      ['Samsung Galaxy A57 5G, 8GB/256GB, Awesome Gray', '8GB', '256GB'],
      ['Samsung Galaxy A57 5G 8GB - 256GB - Awesome Lilac', '8GB', '256GB'],
      ['Samsung Galaxy A57 5G 12GB 256GB Lilac', '12GB', '256GB'],
      ['SAMSUNG Galaxy A57 5G (8+256) Icyblue', '8GB', '256GB'],
      ['OPPO RENO 16F 5G 8 * 256GB POP WHITE (NEW MODEL)', '8GB', '256GB'],
      ['OPPO RENO 16F 5G 12 * 256GB TWILIGHT VIOLET (NEW MODEL)', '12GB', '256GB'],
      ['Xiaomi Redmi 15C 4GB × 128GB Black', '4GB', '128GB'],
      ['Oppo A6 6+128 Aurora Gold', '6GB', '128GB'],
      ['Oppo A6 8GB+256GB Aurora Gold', '8GB', '256GB'],
      ['Samsung Galaxy A57 5G 8/128GB Awesome Gray', '8GB', '128GB'],
      ['Xiaomi 14T 12+512GB', '12GB', '512GB'],
      ['HP Victus 15 Laptop Intel Core i5 16GB 512GB RTX 4050', '16GB', '512GB'],
      // Arabic, with Arabic-Indic digits.
      ['سامسونج جالاكسي A57 5G، 256 جيجابايت، رام 8 جيجابايت، أزرق', '8GB', '256GB'],
      ['سامسونج جالاكسي A57 رام ١٢ جيجا ذاكرة ٢٥٦ جيجا لون كحلي', '12GB', '256GB'],
      ['شاومي ريدمي نوت 14 برو ٨ جيجا رام ٢٥٦ جيجا', '8GB', '256GB'],
      // Storage only.
      ['Apple iPhone 16 Pro (256 GB) - Black Titanium', undefined, '256GB'],
      ['Apple iPhone 16 Pro 1TB Black Titanium', undefined, '1TB'],
      ['ايفون 16 برو 256 جيجا تيتانيوم صحراوي', undefined, '256GB'],
      // A single capacity on a graphics card is its VRAM, never RAM.
      ['MSI GeForce RTX 5050 Ventus 2X 8GB OC Graphics Card', undefined, '8GB'],
      ['ASUS Dual RTX 5060 Ti 16GB GDDR7 OC Edition', undefined, '16GB'],
      // Nothing to read.
      ['Nokia 105 Feature Phone Dual SIM', undefined, undefined],
      ['Samsung Galaxy A57 5G Awesome Navy', undefined, undefined],
    ])('%s -> RAM %s, storage %s', (title, ram, storage) => {
      expect(memory(title)).toEqual({ ram, storage });
    });

    it('does not read a "5G" network label or a model number as a capacity', () => {
      expect(memory('Samsung Galaxy A57 5G')).toEqual({ ram: undefined, storage: undefined });
    });

    it('does not read two capacities as RAM + storage when the sizes are implausible', () => {
      // 16GB VRAM next to 32GB is not "16GB RAM, 32GB storage".
      expect(memory('Graphics card 16GB 12GB')).toEqual({ ram: undefined, storage: '16GB' });
    });
  });

  describe('quantity extraction', () => {
    it.each([
      ['Pepsi Soft Drink Can 330ml', { volumeMl: 330 }],
      ['Pepsi Cola 330 ml Can', { volumeMl: 330 }],
      ['Pepsi Soft Drink Can 330ml - Pack of 6', { volumeMl: 330, packCount: 6 }],
      ['Pepsi Cola Can 330ml x 6', { volumeMl: 330, packCount: 6 }],
      ['Pepsi 6 x 330ml cans', { volumeMl: 330, packCount: 6 }],
      ['Pepsi Soft Drink Bottle 1L', { volumeMl: 1000 }],
      ['Pepsi Soft Drink 1 Liter Bottle', { volumeMl: 1000 }],
      ['Persil Power Gel 2.5L', { volumeMl: 2500 }],
      ['Nescafe Classic Instant Coffee 200g', { weightG: 200 }],
      ['Abu Kass Basmati Rice 5 Kg', { weightG: 5000 }],
      ['نسكافيه كلاسيك قهوة سريعة التحضير ٢٠٠ جرام', { weightG: 200 }],
      ['Tissues 12 pcs', { packCount: 12 }],
      // A phone's "5G" is not five grams.
      ['Samsung Galaxy A57 5G 256GB', {}],
    ])('%s', (title, expected) => {
      expect(extractQuantitySpec(toMatchingText(title))).toEqual(expected);
    });
  });

  it('reads a stated model year', () => {
    expect(extractModelYear('Nokia 105 (2023) Dual SIM')).toBe(2023);
    expect(extractModelYear('RTX 2060 Super')).toBeUndefined();
    expect(extractModelYear('LG 24U411A-B')).toBeUndefined();
  });

  it('recognizes bundles', () => {
    expect(isBundle('PlayStation 5 Slim Disc Console + EA Sports FC 25 Bundle')).toBe(true);
    expect(isBundle('PS5 Slim with 2 Controllers')).toBe(true);
    expect(isBundle('PlayStation 5 Slim Console Disc Edition')).toBe(false);
    expect(isBundle('Nokia 105 Dual SIM with charger')).toBe(false);
  });

  describe('Arabic normalization', () => {
    it('maps Arabic-Indic and Eastern Arabic-Indic digits to ASCII', () => {
      expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789 0123456789');
      expect(normalizeDigits('٢٦٬٣٢٥٫٥٠')).toBe('26325.50');
    });

    it('folds alef/hamza forms, alef maqsura, taa marbuta, diacritics and tatweel', () => {
      expect(normalizeArabic('أإآٱ')).toBe('اااا');
      expect(normalizeArabic('مصطفى')).toBe('مصطفي');
      expect(normalizeArabic('شاشة')).toBe('شاشه');
      expect(normalizeArabic('سَمَّاعَة')).toBe('سماعه');
      expect(normalizeArabic('جـــوال')).toBe('جوال');
    });

    it('spells fixed-meaning Arabic words the English way', () => {
      expect(toMatchingText('سامسونج جالاكسي A57 رام ١٢ جيجا')).toBe('samsung galaxy A57 ram 12 gb');
      expect(toMatchingText('آيفون 16 برو ماكس')).toBe('iphone 16 pro max');
      expect(toMatchingText('ايفون ١٦ بـرو')).toBe('iphone 16 pro');
    });

    it('leaves English titles alone', () => {
      const title = 'Samsung Galaxy A57 5G - 8GB RAM - 256GB - Awesome Navy';
      expect(toMatchingText(title)).toBe(title);
    });

    it('does not replace a word inside a longer word', () => {
      // "ديل" (Dell) inside "موديل" (model).
      expect(toMatchingText('موديل 2024')).toBe('موديل 2024');
    });

    it('expands an Arabic search word to its English spellings', () => {
      expect(englishEquivalents('سامسونج')).toEqual(['samsung']);
      expect(englishEquivalents('آيفون')).toEqual(['iphone']);
      expect(englishEquivalents('غسالة')).toEqual([]);
    });
  });
});
