/**
 * @pricelens/contracts -- the single source of truth for what the API sends
 * and the web app reads.
 *
 * Declaration files only, on purpose: both apps import these with
 * `import type`, so nothing is bundled or required at runtime, the package
 * needs no build step, and the API's compiled output layout is unaffected.
 * `pnpm --filter @pricelens/contracts typecheck` checks the declarations
 * themselves (the apps skip library checks).
 */
export * from './api';
export * from './products';
