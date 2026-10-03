import { alertCard, alertEmoji, cairoTime, escapeHtml, formatMoney, shorten } from '../../src/notifications/telegram-format';

describe('telegram formatting', () => {
  it('escapes only what HTML mode needs', () => {
    expect(escapeHtml('A & B <c> "d" (e) _f_ 1.5')).toBe('A &amp; B &lt;c&gt; "d" (e) _f_ 1.5');
  });

  it('shortens on a single line with an ellipsis', () => {
    expect(shorten('a  b\nc', 10)).toBe('a b c');
    expect(shorten('x'.repeat(30), 10)).toHaveLength(10);
    expect(shorten('x'.repeat(30), 10).endsWith('…')).toBe(true);
  });

  it('writes prices in Egyptian pounds by default', () => {
    expect(formatMoney(54469.4)).toBe('54,469 ج.م');
    expect(formatMoney(100, 'USD')).toBe('100 USD');
  });

  it('formats a time in Cairo as HH:MM', () => {
    expect(cairoTime(new Date('2026-10-03T10:05:00Z'))).toMatch(/^\d{2}:\d{2}$/);
  });

  it('picks a symbol by kind of alert', () => {
    expect(alertEmoji(undefined, 'PRICE_TARGET')).toBe('🎯');
    expect(alertEmoji(undefined, 'RESTOCK')).toBe('📦');
    expect(alertEmoji('brand.map_violation', undefined)).toBe('🚨');
    expect(alertEmoji('something.else', undefined)).toBe('🔔');
  });

  it('builds an alert card with a headline, detail, price and one button', () => {
    const card = alertCard({ title: 'iPhone <15> hit your target', body: 'Now at Jumia.', alertType: 'PRICE_TARGET', price: 41499, url: 'https://pricelens.store/products/x' });
    expect(card.text).toBe('🎯 <b>iPhone &lt;15&gt; hit your target</b>\n\nNow at Jumia.\n\n💰 <b>41,499 ج.م</b>');
    expect(card.buttons).toEqual([[{ text: '🔗 افتح في PriceLens', url: 'https://pricelens.store/products/x' }]]);
    expect(alertCard({ title: 'No link' }).buttons).toEqual([]);
  });
});
