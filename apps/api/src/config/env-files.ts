import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * Which env files the API loads, resolved once and independent of the
 * working directory.
 *
 * The previous `envFilePath: ['../../.env']` resolved against process.cwd():
 * started from apps/api it silently picked up the repo-root .env (production
 * on the server), started from anywhere else it loaded nothing.
 *
 *  - ENV_FILE set          -> exactly that file
 *  - NODE_ENV=test         -> no file; the test runner supplies the environment
 *  - otherwise             -> .env.local then .env at the repo root, if found
 *
 * In the production container there is no repo root (the image carries only
 * apps/api) and compose injects the environment directly, so nothing is read.
 */
export function resolveEnvFiles(env: NodeJS.ProcessEnv = process.env, startDir = __dirname): string[] {
  if (env.ENV_FILE) return [resolve(env.ENV_FILE)];
  if (env.NODE_ENV === 'test') return [];

  const root = findRepoRoot(startDir);
  if (!root) return [];
  return [join(root, '.env.local'), join(root, '.env')].filter((file) => existsSync(file));
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
