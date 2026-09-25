import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Component and unit tests (`pnpm --filter @pricelens/web test`).
// Browser end-to-end tests live in e2e/ and run with Playwright instead.
export default defineConfig({
  // tsconfig says `jsx: preserve` for Next; tests need the JSX compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
