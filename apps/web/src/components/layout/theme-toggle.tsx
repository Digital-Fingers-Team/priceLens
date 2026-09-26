'use client';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { applyThemePreference, readThemePreference, type ThemePreference } from '@/lib/theme';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system -> light -> dark; the label says what it is now and what's next. */
export function ThemeToggle() {
  const { t, tf } = useI18n();
  // Unknown until mounted (the server can't read localStorage).
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setPreference(readThemePreference());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      if (readThemePreference() === 'system') applyThemePreference('system');
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const current = preference ?? 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICONS[current];

  return (
    <IconButton
      aria-label={tf(t.theme.toggle, { current: t.theme[current], next: t.theme[next] })}
      title={tf(t.theme.toggle, { current: t.theme[current], next: t.theme[next] })}
      onClick={() => {
        applyThemePreference(next);
        setPreference(next);
      }}
    >
      <Icon className="h-4 w-4" />
    </IconButton>
  );
}
