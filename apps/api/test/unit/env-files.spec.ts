import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveEnvFiles } from '../../src/config/env-files';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('resolveEnvFiles', () => {
  let root: string;
  let deep: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'envfiles-'));
    deep = join(root, 'apps', 'api', 'dist', 'src');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds the repo-root .env from any depth, regardless of cwd', () => {
    writeFileSync(join(root, '.env'), 'A=1\n');
    expect(resolveEnvFiles(env({}), deep)).toEqual([join(root, '.env')]);
  });

  it('puts .env.local before .env', () => {
    writeFileSync(join(root, '.env'), 'A=1\n');
    writeFileSync(join(root, '.env.local'), 'A=2\n');
    expect(resolveEnvFiles(env({}), deep)).toEqual([join(root, '.env.local'), join(root, '.env')]);
  });

  it('loads no file under NODE_ENV=test', () => {
    writeFileSync(join(root, '.env'), 'A=1\n');
    expect(resolveEnvFiles(env({ NODE_ENV: 'test' }), deep)).toEqual([]);
  });

  it('honours an explicit ENV_FILE', () => {
    expect(resolveEnvFiles(env({ ENV_FILE: join(root, 'custom.env') }), deep)).toEqual([
      join(root, 'custom.env'),
    ]);
  });

  it('loads nothing when there is no repo root (production image)', () => {
    rmSync(join(root, 'pnpm-workspace.yaml'));
    expect(resolveEnvFiles(env({}), deep)).toEqual([]);
  });
});
