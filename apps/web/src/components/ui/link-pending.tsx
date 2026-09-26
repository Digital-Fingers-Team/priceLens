'use client';
import { useLinkStatus } from 'next/link';

/**
 * A thin bar along the bottom of the nearest positioned ancestor while the
 * enclosing <Link>'s navigation is in flight (audit 06, U-12). Product pages
 * render on the server with no loading.tsx (phase 05 kept real 404s), so
 * without this a click on a slow connection looks ignored.
 * Must be rendered inside a next/link <Link>.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="progressbar"
      aria-label="Loading"
      className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse rounded-b-xl bg-signal motion-reduce:animate-none"
    />
  );
}
