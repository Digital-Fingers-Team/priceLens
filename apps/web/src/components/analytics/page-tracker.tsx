'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { PUBLIC_API_URL } from '@/config/constants';

/**
 * Counts page views and the time each page was visible, for the admin
 * analytics page (owner, 2026-09-29). Anonymous: a random visitor id in
 * localStorage and a session id in sessionStorage; the API stores no IP.
 * Admin pages are not counted (the API drops them too).
 */

const VISITOR_KEY = 'pl_vid';
const SESSION_KEY = 'pl_sid';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 from Math.random, for browsers without randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function storedId(storage: () => Storage, key: string): string {
  try {
    const existing = storage().getItem(key);
    if (existing) return existing;
    const id = uuid();
    storage().setItem(key, id);
    return id;
  } catch {
    return uuid(); // storage blocked: counted as a new visitor each time
  }
}

function send(path: string, body: unknown): void {
  const url = `${PUBLIC_API_URL}${path}`;
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(url, new Blob([json], { type: 'application/json' }))) return;
  } catch {
    // fall through to fetch
  }
  fetch(url, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(
    () => undefined,
  );
}

/** The result count the search page shows (data-search-total on its heading). */
function searchTotal(): number | undefined {
  const value = document.querySelector('[data-search-total]')?.getAttribute('data-search-total');
  return value ? Number(value) : undefined;
}

export function PageTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (/^\/(?:(?:en|ar)\/)?admin(?:\/|$)/.test(pathname)) return;

    const id = uuid();
    send('/analytics/views', {
      id,
      visitorId: storedId(() => localStorage, VISITOR_KEY),
      sessionId: storedId(() => sessionStorage, SESSION_KEY),
      path: search ? `${pathname}?${search}` : pathname,
      referrer: document.referrer || undefined,
    });

    // Visible time only: a tab in the background is not someone reading it.
    let visibleMs = 0;
    let shownAt: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    // The count is read while this page is showing: by the time the effect
    // cleans up after a client navigation, the next page is already rendered.
    let results: number | undefined;
    const reader = /\/search$/.test(pathname)
      ? setInterval(() => {
          results = searchTotal() ?? results;
        }, 1000)
      : undefined;
    const flush = () => {
      const total = visibleMs + (shownAt != null ? Date.now() - shownAt : 0);
      send(`/analytics/views/${id}/duration`, { durationMs: Math.round(total), searchTotal: results });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (shownAt != null) visibleMs += Date.now() - shownAt;
        shownAt = null;
        flush(); // the tab may never come back (closed on a phone)
      } else if (shownAt == null) {
        shownAt = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(reader);
      flush();
    };
  }, [pathname, search]);

  return null;
}
