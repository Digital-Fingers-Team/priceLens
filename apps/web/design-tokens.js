/**
 * The PriceLens design tokens: the one place colors are defined (audit 07,
 * UI-01/UI-02). tailwind.config.js turns each theme into CSS variables
 * (`--color-<name>` as "r g b" channels, so Tailwind's `/opacity` modifiers
 * work) and every utility reads those variables, so light and dark are the
 * same class names with different values. design-system.test.ts checks text
 * contrast for every pair the UI uses.
 *
 * Identity: Ink & Coral rebrand (2026-10-03). Ink blue is the brand voice on a
 * cream page; coral is reserved for money saved (`accent` / `accent-fg`) and is
 * only ever a background with dark text, never text on cream or white.
 * Each token also publishes the rebrand's `--pl-*` name (see PL_NAMES), so
 * both vocabularies resolve to the same value.
 *
 * CommonJS: tailwind.config.js requires it.
 */

/** Ink blue ramp, used by the Open Graph card (satori has no stylesheet). */
const ink = {
  50: '#F5F1EA',
  100: '#DCE5F0',
  200: '#B9CBE0',
  300: '#8DB0D6',
  400: '#386AA6',
  500: '#2E5A8F',
  600: '#1E3A5F',
  700: '#12253D',
  800: '#0F1B2D',
  900: '#0A1220',
};

/** @type {Record<'light' | 'dark', Record<string, string>>} */
const themes = {
  light: {
    bg: '#F5F1EA',
    surface: '#FFFFFF',
    'surface-2': '#EBE5DA',
    border: '#E4DED3',
    'border-strong': '#7C8594',
    fg: '#12253D',
    muted: '#5E6677',
    brand: '#1E3A5F',
    'brand-hover': '#274A75',
    // Brand-colored text and icons; equals brand in light, lifted in dark.
    'brand-text': '#1E3A5F',
    'brand-fg': '#F5F1EA',
    'brand-soft': '#DCE5F0',
    'brand-soft-fg': '#12253D',
    // Savings only. A background with accent-fg text; never text itself.
    accent: '#FF8A6B',
    'accent-fg': '#3A1206',
    success: '#176B41',
    'success-soft': '#DCEDE2',
    warning: '#8A5300',
    'warning-soft': '#F3E6CC',
    danger: '#B42318',
    'danger-soft': '#F6DEDA',
    info: '#1D5FA8',
    'info-soft': '#DCE5F0',
    // Behind product photos: stores shoot on white, so photos sit on white.
    media: '#FFFFFF',
    // Modal backdrop.
    scrim: '#12253D',
  },
  dark: {
    bg: '#0F1B2D',
    surface: '#16263D',
    'surface-2': '#1C3050',
    border: '#24364F',
    'border-strong': '#6B7F9E',
    fg: '#F5F1EA',
    muted: '#A7B0C0',
    brand: '#2E5A8F',
    'brand-hover': '#386AA6',
    'brand-text': '#8DB0D6',
    'brand-fg': '#F5F1EA',
    'brand-soft': '#1E3A5F',
    'brand-soft-fg': '#DCE5F0',
    accent: '#FF8A6B',
    'accent-fg': '#3A1206',
    success: '#4CC38A',
    'success-soft': '#12291D',
    warning: '#E0A33A',
    'warning-soft': '#2E2311',
    danger: '#F97066',
    'danger-soft': '#34181A',
    info: '#6FA8E8',
    'info-soft': '#14243A',
    // Slightly dimmed white: photos keep their white ground without glare.
    media: '#E4E5E6',
    scrim: '#0A1220',
  },
};

/** Token -> the rebrand's CSS variable name. */
const PL_NAMES = {
  bg: 'pl-bg',
  surface: 'pl-surface',
  border: 'pl-border',
  fg: 'pl-text',
  muted: 'pl-text-muted',
  brand: 'pl-primary',
  'brand-hover': 'pl-primary-hover',
  'brand-fg': 'pl-on-primary',
  'brand-soft': 'pl-mist',
  accent: 'pl-accent',
  'accent-fg': 'pl-on-accent',
};

/** "#1E3A5F" -> "30 58 95" */
function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

/** { '--color-bg': '245 241 234', '--pl-bg': '#F5F1EA', ... } for one theme. */
function cssVariables(theme) {
  const vars = Object.fromEntries(Object.entries(theme).map(([name, hex]) => [`--color-${name}`, channels(hex)]));
  for (const [name, plName] of Object.entries(PL_NAMES)) vars[`--${plName}`] = theme[name];
  // --pl-primary-deep: the heading ink, the same value as the text color.
  vars['--pl-primary-deep'] = theme.fg;
  return vars;
}

module.exports = { ink, themes, channels, cssVariables };
