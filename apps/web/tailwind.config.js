/**
 * The design system's scales (audit 07). Colors come from design-tokens.js
 * as CSS variables; everything else is defined here and nowhere else. The
 * theme replaces Tailwind's defaults rather than extending them, so an
 * off-system class (`text-emerald-400`, `rounded-2xl`, `text-3xl`) simply
 * does not exist.
 */
const plugin = require('tailwindcss/plugin');
const { moss, themes, cssVariables } = require('./design-tokens');

const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;
const semantic = Object.fromEntries(Object.keys(themes.light).map((name) => [name, token(name)]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  // The pre-paint script always resolves data-theme (system -> light/dark),
  // so `dark:` is available, though tokens make it rarely needed.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      moss,
      ...semantic,
    },
    fontFamily: {
      sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
    },
    // Six sizes. Line heights are the Latin ones; :lang(ar) opens them up
    // in globals.css (Arabic needs taller lines for its marks).
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.25rem', { lineHeight: '1.75rem' }],
      xl: ['1.5rem', { lineHeight: '2rem' }],
      '2xl': ['2rem', { lineHeight: '2.5rem' }],
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
    },
    // Sharp by default; `full` is kept for the pill moments (search field,
    // status dots, avatars).
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '4px',
      md: '6px',
      full: '9999px',
    },
    // Three elevation levels: raised (sticky bars), overlay (menus,
    // popovers, toasts), modal.
    boxShadow: {
      none: 'none',
      sm: '0 1px 2px rgb(var(--shadow-color) / 0.08)',
      DEFAULT: '0 4px 16px rgb(var(--shadow-color) / 0.12)',
      lg: '0 16px 48px rgb(var(--shadow-color) / 0.24)',
    },
    // The 4/8 grid: every step is a multiple of 4px (plus the 1px hairline).
    spacing: {
      0: '0',
      px: '1px',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      7: '1.75rem',
      8: '2rem',
      9: '2.25rem',
      10: '2.5rem',
      11: '2.75rem',
      12: '3rem',
      14: '3.5rem',
      16: '4rem',
      20: '5rem',
      24: '6rem',
      28: '7rem',
      32: '8rem',
      40: '10rem',
      48: '12rem',
      56: '14rem',
      64: '16rem',
      72: '18rem',
      80: '20rem',
      96: '24rem',
    },
    extend: {
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        enter: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        enter: 'enter 200ms ease-out',
        'sheet-up': 'sheet-up 250ms ease-out',
      },
      gridTemplateColumns: {
        // Offer row: details, price, store link.
        offer: '1fr auto auto',
      },
      aspectRatio: {
        product: '4 / 3',
      },
      minWidth: {
        // Wide tables scroll inside their card rather than squeezing columns.
        table: '40rem',
        'table-lg': '48rem',
      },
      minHeight: {
        // The page area under the 64px header.
        page: 'calc(100dvh - 4rem)',
      },
      maxHeight: {
        // Sheets and modals leave the top of the screen visible.
        sheet: '85dvh',
      },
      maxWidth: {
        page: '80rem',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...cssVariables(themes.light), '--shadow-color': '18 19 20', 'color-scheme': 'light' },
        // No JS yet (or "system"): follow the OS.
        '@media (prefers-color-scheme: dark)': {
          ':root:not([data-theme="light"])': {
            ...cssVariables(themes.dark),
            '--shadow-color': '0 0 0',
            'color-scheme': 'dark',
          },
        },
        ':root[data-theme="dark"]': { ...cssVariables(themes.dark), '--shadow-color': '0 0 0', 'color-scheme': 'dark' },
      });
    }),
  ],
};
