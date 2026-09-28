import { accessSync, constants, mkdirSync } from 'fs';
import { resolve } from 'path';

/**
 * Where ops scripts write rollback files: BACKUP_DIR, or the repo-root
 * backups/ directory. Checked for writing up front, before a script changes
 * anything: since the image runs as uid 1000 (audit 11), /repo/backups cannot
 * be created in the container, and a repair once applied its change and then
 * failed to write the rollback file. In the container run with
 * BACKUP_DIR=/tmp/backups and copy the file out with `podman cp`.
 */
export function backupDir(): string {
  const dir = process.env.BACKUP_DIR ?? resolve(__dirname, '../../../../backups');
  mkdirSync(dir, { recursive: true });
  accessSync(dir, constants.W_OK);
  return dir;
}
