import { isMisfiledEarbuds } from '../../scripts/ops/earbuds-title';

describe('isMisfiledEarbuds', () => {
  it('finds earbuds and earphones', () => {
    expect(isMisfiledEarbuds('HUAWEI FreeBuds Pro 3, Ultra-Hearing Dual Driver, Pure Voice 2.0')).toBe(true);
    expect(isMisfiledEarbuds('Samsung Galaxy Buds3 FE, Wireless Earbuds, Blade Design')).toBe(true);
    expect(isMisfiledEarbuds('Oneplus Bullets Z2 Wireless Neckband In-Ear Earphones')).toBe(true);
    expect(isMisfiledEarbuds('Infinix XBuds GT3 Earbuds , Black - XE30')).toBe(true);
  });

  it('leaves things made for earbuds, and other devices, where they are', () => {
    expect(isMisfiledEarbuds('Silicone Cover Case Compatible with Redmi Buds 6 Active Portable Protective Case')).toBe(false);
    expect(isMisfiledEarbuds('2-10Pcs Bluetooth Earphone Battery CP1160 For Huawei FreeBuds Pro')).toBe(false);
    expect(isMisfiledEarbuds('2pcs Earpiece For Nokia Lumia 520 630')).toBe(false);
    expect(isMisfiledEarbuds('JBL Flip 6 Portable Speaker, TWS pairing')).toBe(false);
    expect(isMisfiledEarbuds('Samsung Galaxy S24 256GB + Galaxy Buds FE')).toBe(false);
    expect(isMisfiledEarbuds('Smart Watch with Earbuds 2 in 1')).toBe(false);
    expect(isMisfiledEarbuds('Realme 16 Pro with free gift (REALME BUDS T200 lite )')).toBe(false);
  });
});
