const KEY = 'pl-guest-watchlist';

function readIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    const values = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(values);
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
}

export function getGuestWatchlistIds(): Set<string> {
  return readIds();
}

export function isGuestWatched(productId: string): boolean {
  return readIds().has(productId);
}

export function toggleGuestWatchlist(productId: string): boolean {
  const ids = readIds();
  const next = !ids.has(productId);
  if (next) ids.add(productId);
  else ids.delete(productId);
  writeIds(ids);
  return next;
}
