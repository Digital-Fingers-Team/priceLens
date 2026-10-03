import { isPhoneAccessory } from '../../src/matching/text/phone-accessory';

describe('isPhoneAccessory', () => {
  it.each([
    'Clear MagSafe-Compatible TPU Case and Camera Lens Protector for Samsung Galaxy A05S - Pink',
    'Liquid Silicone Case for Original Samsung Galaxy A17 A56 A36 A26 A16 A06 A55 A35 A25 A15 A05S Shockproof Cover',
    '1-3PCS Full Cover Hydrogel Film For Samsung Galaxy A55 A15 5G A35 A25 A05 A05s',
    'Back Cover Compatible With Phone Samsung A05S',
    'جراب ماجسيف مضاد للصدمات لهاتف سامسونج جالاكسي ايه زيرو 5 اس - شفاف',
    'Tempered Glass Screen Protector for iPhone 17 Pro Max',
    'LCD Display Assembly Replacement for itel A70 A60',
    'Smart Folio Cover for iPad Air 11',
  ])('files "%s" as a phone accessory', (title) => {
    expect(isPhoneAccessory(title)).toBe(true);
  });

  it.each([
    // The devices themselves, including one sold with a free cover.
    'Samsung Galaxy A05s Dual SIM 4GB RAM 128GB - Black',
    'Samsung Galaxy A57 5G with Free Cover',
    'سامسونج جالاكسي A57 مع جراب هدية',
    // Accessories of other devices stay with them.
    'Silicone Strap Band for Apple Watch Series 9 Compatible with iPhone',
    'Protective Case for Galaxy Buds 3 Pro',
    'AirPods Pro 2 Case Cover',
    'Laptop Sleeve Case 15.6 inch for MacBook',
    'PS5 Controller Silicone Cover',
    // Found on production: devices sold with a case, or described with an LCD.
    'Lenovo Tab Wi-Fi With Kids Bumper Case (4GB, 128GB) Luna Grey',
    'Lenovo Idea Tab Wi-Fi Only With Pen + Folio Case',
    'Honor Pad 10 Tablet 12.1 Inch Wi-Fi With Free Gift Smart Cover With Keyboard',
    '[New] realme P4x Smartphone NFC 8000mAh Battery 45W Charge 6.8" 120Hz LCD Display 50MP AI Camera IP64',
    'Low Cost A3+ Flatbed UV Printer Inkjet Printing Machine for Phone Case Glass Trophy',
    'Xiaomi 2K Gaming Monitor G27Qi | 27-inch fast LCD | 180Hz high refresh rate',
    // Not an accessory at all.
    'Anker 20W USB-C Charger for iPhone',
    'Sony WH-1000XM5 Wireless Headphones',
  ])('leaves "%s" where it is', (title) => {
    expect(isPhoneAccessory(title)).toBe(false);
  });
});
