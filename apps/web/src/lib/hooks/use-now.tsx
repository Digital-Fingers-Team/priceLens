'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * "Now" for relative times ("checked 5m ago") on server-rendered pages.
 *
 * A cached (ISR) page's HTML can be minutes old. Computing the relative time
 * again at hydration with Date.now() gave different text than the HTML, which
 * React reports as a hydration error (React error 418) and answers by re-rendering the
 * page (found by CI, phase 10). So the first render uses the time the HTML was
 * rendered, on the server and in the browser alike, and the clock moves to the
 * real time right after hydration and then once a minute.
 */
const RenderedAtContext = createContext<number | undefined>(undefined);

export function RenderedAtProvider({ value, children }: { value: number | undefined; children: ReactNode }) {
  return <RenderedAtContext.Provider value={value}>{children}</RenderedAtContext.Provider>;
}

export function useNow(): number {
  const renderedAt = useContext(RenderedAtContext);
  const [now, setNow] = useState(() => renderedAt ?? Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
