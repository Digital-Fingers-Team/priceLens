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

    it('flags spare parts that carry the phone model number', () => {
      // Real listings that were merged into the phone as its cheapest price.
      expect(service.isAccessory('Original Lcd C71 for Realme C71 Screen 100% Tested')).toBe(true);
      expect(service.isAccessory('Mobile Phone LCDs Display Pantalla 100% Tested for Itel A100c')).toBe(true);
      expect(service.isAccessory('GOLDEN MASK For Realme C53/Realme Narzo N53 Camera Lens Protector')).toBe(true);
      expect(service.isAccessory('Back Glass Housing Replacement Galaxy S24')).toBe(true);
    });

    it('does not flag actual products', () => {
      expect(service.isAccessory('NVIDIA RTX 4090 24GB GDDR6X')).toBe(false);
      expect(service.isAccessory('Apple MacBook Pro 14 M3 Pro')).toBe(false);
      expect(service.isAccessory('Samsung Galaxy S24 Ultra 256GB')).toBe(false);
      expect(service.isAccessory('Realme C71 Smartphone 4GB RAM 256GB Storage Forest Green')).toBe(false);
      expect(service.isAccessory('ASUS TUF Gaming Laptop for Gaming and Work RTX 4060')).toBe(false);
      expect(service.isAccessory('Desktop Graphics Card for Gaming Computer RTX 5090 32GB')).toBe(false);
      expect(service.isAccessory('Samsung 55 Inch OLED Display 4K Smart TV')).toBe(false);
      expect(service.isAccessory('LG 24 Inch LCD Monitor Full HD')).toBe(false);
      expect(service.isAccessory('TORNADO 32 Inch LCD TV HD')).toBe(false);
      // "for <brand>" is not an accessory signal on its own.
      expect(service.isAccessory('Apple 2024 MacBook Pro Laptop with M4 Pro: Built for Apple Intelligence')).toBe(false);
    });
  });

  describe('model extraction (phase 02)', () => {
    it.each([
      ['Apple iPhone 16 Pro (256 GB) - Black Titanium', 'iPhone 16 Pro'],
      ['Apple iPhone 16 Pro 256GB Desert Titanium', 'iPhone 16 Pro'],
      ['iPhone 16 Pro Max (256 GB) - Black Titanium', 'iPhone 16 Pro Max'],
      ['Apple iPhone 16 128GB Black', 'iPhone 16'],
      ['ايفون 16 برو 256 جيجا', 'iphone 16 pro'],
      ['Samsung Galaxy A57 5G 8GB RAM 256GB', 'Galaxy A57'],
      ['Samsung A57 5G Smartphone 8GB RAM 256GB Storage Navy', 'Galaxy A57'],
      ['سامسونج جالاكسي A57 رام 12 جيجا', 'galaxy A57'],
      ['Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black', 'redmi note 14'],
      ['Redmi Note 14 Pro 5G 8GB 256GB Midnight Black', 'redmi note 14'],
      ['Infinix HOT 50 - 256GB/8GB - Titanium Grey', 'hot 50'],
      ['OPPO A6 - 8GB RAM - 256GB - Sapphire Blue', 'a6'],
      ['OPPO Reno 15 5G 12GB 512GB', 'reno15'],
      ['Honor X9c 12GB RAM 256GB Titanium Black', 'x9c'],
      ['Nokia 105 Feature Phone Dual SIM', '105'],
      ['Honor Phone 5G 128GB', undefined],
    ])('%s -> %s', (title, model) => {
      const extracted = service.extractAttributes(title).model;
      expect(extracted === undefined ? undefined : extracted.toLowerCase()).toBe(model?.toLowerCase());
    });
  });

  describe('color (stored per offer for the phase 06 color filter)', () => {
    it.each([
      ['Samsung Galaxy A57 5G 256GB 8GB RAM Awesome Navy', 'awesome navy'],
      ['Apple iPhone 16 Pro 256GB Desert Titanium', 'desert titanium'],
      ['Samsung Galaxy A57 5G 12GB - 256GB - Awesome Icyblue', 'awesome icyblue'],
      ['سامسونج جالاكسي A57 256 جيجا أزرق', 'blue'],
      ['Xiaomi Redmi Note 14 Pro 8GB RAM 256GB Black', 'black'],
      // "Redmi" is not red.
      ['Xiaomi Redmi Note 14 Pro 8GB 256GB', undefined],
    ])('%s -> %s', (title, color) => {
      expect(service.extractAttributes(title).color).toBe(color);
    });

    it('prefers a color the store gives as an attribute', () => {
      expect(service.extractAttributes('Galaxy A57', { color: 'Lilac' }).color).toBe('lilac');
    });
  });

  describe('accessories in Arabic and accessory kinds', () => {
    it('flags Arabic accessory titles whatever the letter forms', () => {
      expect(service.isAccessory('جراب سامسونج جالاكسي A57 شفاف')).toBe(true);
      expect(service.isAccessory('زجاج مقوى لايفون 16 برو')).toBe(true);
      expect(service.isAccessory('حافظة ايفون 16')).toBe(true);
      expect(service.isAccessory('سامسونج جالاكسي A57 رام 8 جيجا')).toBe(false);
    });

    it.each([
      ['Silicone Case for Samsung Galaxy A57 5G - Black', 'case'],
      ['جراب سامسونج جالاكسي A57 شفاف', 'case'],
      ['Tempered Glass Screen Protector for iPhone 16 Pro', 'screen-protector'],
      ['Apple 20W USB-C Power Adapter for iPhone 16 Pro', 'charger'],
      ['Original Lcd C71 for Realme C71 Screen', 'part'],
      ['Samsung Galaxy A57 5G 256GB', null],
    ])('%s is a %s', (title, kind) => {
      expect(service.accessoryKind(title)).toBe(kind);
    });
  });
});
