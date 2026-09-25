import { Logger } from '@nestjs/common';

/**
 * Consecutive-failure tally per connector, and the time its circuit closes
 * again. Each attempt against a blocked store costs a full real-browser page
 * load and yields nothing, so once a store has failed `threshold` times in a
 * row it is left alone for the cooldown instead of being retried for every
 * product in a batch.
 *
 * In memory on purpose: a restart is a reasonable moment to give a
 * struggling store another chance, and this only needs to hold for a sweep.
 */
export class ConnectorCircuitBreaker {
  private readonly logger = new Logger(ConnectorCircuitBreaker.name);
  private readonly failures = new Map<string, number>();
  private readonly cooldownUntil = new Map<string, number>();

  constructor(private readonly settings: () => { threshold: number; cooldownMinutes: number }) {}

  /** True while the connector is paused. A served cooldown resets its count. */
  isInCooldown(slug: string): boolean {
    const until = this.cooldownUntil.get(slug);
    if (until == null) {
      return false;
    }
    if (Date.now() >= until) {
      this.cooldownUntil.delete(slug);
      this.failures.set(slug, 0);
      return false;
    }
    return true;
  }

  recordFailure(slug: string, reason: string): void {
    const { threshold, cooldownMinutes } = this.settings();
    const failures = (this.failures.get(slug) ?? 0) + 1;
    this.failures.set(slug, failures);

    if (failures >= threshold && !this.cooldownUntil.has(slug)) {
      this.cooldownUntil.set(slug, Date.now() + cooldownMinutes * 60 * 1000);
      this.logger.warn(
        `Connector "${slug}" failed ${failures} times in a row (last: ${reason}) -- ` +
          `pausing it for ${cooldownMinutes}m.`,
      );
    }
  }

  recordSuccess(slug: string): void {
    this.failures.set(slug, 0);
  }
}
