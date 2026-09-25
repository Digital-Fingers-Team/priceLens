import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { validateEnv } from '../../src/config/env.validation';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
// The API image carries only apps/api, and deploy-api.sh runs the unit suite
// inside it; this check needs the whole checkout, so it only runs there.
const IN_CHECKOUT = existsSync(join(REPO_ROOT, '.env.example'));
const EXAMPLE = IN_CHECKOUT ? readFileSync(join(REPO_ROOT, '.env.example'), 'utf8') : '';

/** Variable names in .env.example, including commented-out `# NAME=` lines. */
function documentedNames(): Set<string> {
  return new Set([...EXAMPLE.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]));
}

function parseExample(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of EXAMPLE.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js)$/.test(entry) ? [path] : [];
  });
}

(IN_CHECKOUT ? describe : describe.skip)('.env.example', () => {
  it('passes startup validation as written', () => {
    expect(() => validateEnv(parseExample())).not.toThrow();
  });

  it('documents every environment variable the apps read', () => {
    const used = new Set<string>();
    const roots = ['apps/api/src', 'apps/web/src'].map((dir) => join(REPO_ROOT, dir));
    const files = [...roots.flatMap(sourceFiles), join(REPO_ROOT, 'apps/web/next.config.js')];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
        used.add(match[1]);
      }
    }

    const documented = documentedNames();
    const missing = [...used].filter((name) => !documented.has(name) && name !== 'NODE_ENV');
    expect(missing).toEqual([]);
  });
});
