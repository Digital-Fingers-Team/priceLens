/**
 * Which half of the application this process runs (ADR 0004, D-9).
 *
 *   api     HTTP only. Enqueues jobs (IngestionQueue) but runs none: no Bull
 *           processors, no scheduler, no browser.
 *   worker  Bull processors, the scheduler and the scraping browsers. It still
 *           listens on PORT so its container has a health check, but nothing
 *           routes traffic to it.
 *   all     Both, in one process: development, tests, and any deployment that
 *           has not split yet. The default.
 *
 * Read from process.env when AppModule is evaluated, after ConfigModule has
 * loaded the env files (it is the first entry of AppModule's imports).
 */
export const PROCESS_ROLES = ['all', 'api', 'worker'] as const;
export type ProcessRole = (typeof PROCESS_ROLES)[number];

export function processRole(env: NodeJS.ProcessEnv = process.env): ProcessRole {
  const value = (env.PROCESS_ROLE ?? '').trim().toLowerCase() || 'all';
  if (!(PROCESS_ROLES as readonly string[]).includes(value)) {
    throw new Error(`PROCESS_ROLE must be one of ${PROCESS_ROLES.join(', ')}`);
  }
  return value as ProcessRole;
}

/** True when this process consumes jobs and runs the scheduler. */
export function runsWorkers(role: ProcessRole): boolean {
  return role !== 'api';
}
