/**
 * Telegram message building shared by the price bot, the alert channel and the
 * owner's payment message. Everything is sent as HTML: it needs only <, > and &
 * escaped, where MarkdownV2 breaks on any of twenty characters that product
 * titles are full of.
 */

export interface TelegramButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line of text cut to `max` characters, with an ellipsis when it was longer. */
export function shorten(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatMoney(value: number, currency = 'EGP'): string {
  const label = currency === 'EGP' ? 'ج.م' : currency;
  return `${Math.round(value).toLocaleString('en-US')} ${label}`;
}

/** HH:MM in Cairo, for "updated at". */
export function cairoTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }).format(date);
}

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
export const numberEmoji = (n: number): string => NUMBER_EMOJI[n - 1] ?? `${n}.`;

/** The symbol that opens an alert, by what kind of alert it is. */
export function alertEmoji(type: string | undefined, alertType: string | undefined): string {
  switch (alertType) {
    case 'PRICE_TARGET':
      return '🎯';
    case 'PRICE_DROP_ABSOLUTE':
    case 'PRICE_DROP_PERCENT':
      return '📉';
    case 'LOWEST_EVER':
      return '🏆';
    case 'MAJOR_DISCOUNT':
      return '🔥';
    case 'RESTOCK':
      return '📦';
    case 'PRICE_INCREASE':
      return '📈';
  }
  if (type?.includes('map_violation')) return '🚨';
  if (type?.startsWith('billing.')) return '💳';
  if (type?.startsWith('brand.') || type?.startsWith('competitor')) return '🏪';
  return '🔔';
}

export interface AlertCard {
  title: string;
  body?: string;
  type?: string;
  alertType?: string;
  price?: number | null;
  currency?: string;
  url?: string | null;
  openLabel?: string;
}

/** An alert as a short card: a bold headline, the detail, the price, one button. */
export function alertCard(card: AlertCard): { text: string; buttons: TelegramButton[][] } {
  const lines = [`${alertEmoji(card.type, card.alertType)} <b>${escapeHtml(shorten(card.title, 200))}</b>`];
  if (card.body?.trim()) lines.push('', escapeHtml(card.body.trim()));
  if (card.price != null && Number.isFinite(card.price)) lines.push('', `💰 <b>${escapeHtml(formatMoney(card.price, card.currency))}</b>`);
  const buttons: TelegramButton[][] = card.url ? [[{ text: card.openLabel ?? '🔗 افتح في PriceLens', url: card.url }]] : [];
  return { text: lines.join('\n'), buttons };
}
