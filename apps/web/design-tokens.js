/**
 * The PriceLens design tokens: the one place colors are defined (audit 07,
 * UI-01/UI-02). tailwind.config.js turns each theme into CSS variables
 * (`--color-<name>` as "r g b" channels, so Tailwind's `/opacity` modifiers
 * work) and every utility reads those variables, so light and dark are the
 * same class names with different values. design-tokens.test.ts checks text
 * contrast for every pair the UI uses.
 *
 * Identity: the owner's Moss palette (2026-09-26). Brand is Moss 600 in light
 * mode and Moss 400 in dark mode; neutrals are cool concrete greys. Success
 * is a bluer green so "in stock" never reads as a brand accent.
 *
 * CommonJS: tailwind.config.js requires it.
 */

const moss = {
  50: '#F2F4E8',
  100: '#E1E6C8',
  200: '#C6D09A',
  300: '#A8B66E',
  400: '#8C9C4A',
  500: '#6E7C36',
  600: '#4F5A2A',
  700: '#3C4520',
  800: '#2A3017',
  900: '#1A1E0E',
};

/** @type {Record<'light' | 'dark', Record<string, string>>} */
const themes = {
  light: {
    bg: '#E6E7E5',
    surface: '#F4F4F2',
    'surface-2': '#EBECE9',
    border: '#C4C6C3',
    'border-strong': '#7D817E',
    fg: '#121314',
    muted: '#4A4D50',
    brand: moss[600],
    'brand-hover': moss[700],
    'brand-fg': moss[50],
    'brand-soft': moss[100],
    'brand-soft-fg': moss[700],
    success: '#176B41',
    'success-soft': '#DCEDE2',
    warning: '#8A5300',
    'warning-soft': '#F3E6CC',
    danger: '#B42318',
    'danger-soft': '#F6DEDA',
    info: '#1D5FA8',
    'info-soft': '#DCE6F3',
    // Behind product photos: stores shoot on white, so photos sit on white.
    media: '#FFFFFF',
  },
  dark: {
    bg: '#101112',
    surface: '#1A1C1D',
    'surface-2': '#222526',
    border: '#2C2F30',
    'border-strong': '#6A6E71',
    fg: '#E4E5E6',
    // Owner's #8A8D90, lifted one step: it must also reach 4.5:1 on brand-soft.
    muted: '#93969A',
    brand: moss[400],
    'brand-hover': moss[300],
    'brand-fg': moss[900],
    'brand-soft': moss[800],
    'brand-soft-fg': moss[200],
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
  },
};

/** "#4F5A2A" -> "79 90 42" */
function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

/** { '--color-bg': '230 231 229', ... } for one theme. */
function cssVariables(theme) {
  return Object.fromEntries(Object.entries(theme).map(([name, hex]) => [`--color-${name}`, channels(hex)]));
}

module.exports = { moss, themes, channels, cssVariables };
