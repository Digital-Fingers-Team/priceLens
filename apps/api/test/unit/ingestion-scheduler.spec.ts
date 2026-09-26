import type { Queue } from 'bull';
import type { ConfigService } from '@nestjs/config';
import { IngestionScheduler } from '../../src/workers/ingestion.scheduler';
import {
  RUN_COMPETITOR_DETECTION_JOB,
  RUN_LAUNCH_DETECTION_JOB,
  RUN_LIVE_INGESTION_JOB,
  RUN_MAP_SWEEP_JOB,
  RUN_NOTIFICATION_RETRY_JOB,
  RUN_PRICE_ALERTS_JOB,
  RUN_RECONCILIATION_JOB,
  RUN_STORE_COVERAGE_SWEEP_JOB,
  RUN_SUBSCRIPTION_MAINTENANCE_JOB,
  RUN_WEEKLY_REPORTS_JOB,
} from '../../src/workers/ingestion.jobs';

const ALWAYS_ON = [
  RUN_PRICE_ALERTS_JOB,
  RUN_NOTIFICATION_RETRY_JOB,
  RUN_SUBSCRIPTION_MAINTENANCE_JOB,
  RUN_COMPETITOR_DETECTION_JOB,
  RUN_MAP_SWEEP_JOB,
  RUN_LAUNCH_DETECTION_JOB,
  RUN_WEEKLY_REPORTS_JOB,
];

async function scheduledJobs(flags: Record<string, boolean>): Promise<string[]> {
  const add = jest.fn(async () => ({}));
  const queue = {
    getRepeatableJobs: jest.fn(async () => [{ key: 'old' }]),
    removeRepeatableByKey: jest.fn(async () => undefined),
    add,
  } as unknown as Queue;
  const config = { get: (key: string, fallback: unknown) => (key in flags ? flags[key] : fallback) } as ConfigService;

  await new IngestionScheduler(queue, config).registerJobs();
  return add.mock.calls.map((call) => (call as unknown[])[0] as string).sort();
}

describe('IngestionScheduler switches (B-08)', () => {
  it('schedules everything when every switch is on (production today)', async () => {
    expect(await scheduledJobs({})).toEqual(
      [RUN_LIVE_INGESTION_JOB, RUN_RECONCILIATION_JOB, RUN_STORE_COVERAGE_SWEEP_JOB, ...ALWAYS_ON].sort(),
    );
  });

  it('LIVE_INGESTION_SCHEDULE_ENABLED=false turns off only the sweep', async () => {
    const jobs = await scheduledJobs({ 'retailers.liveIngestionScheduleEnabled': false });
    expect(jobs).not.toContain(RUN_LIVE_INGESTION_JOB);
    expect(jobs).toEqual([RUN_RECONCILIATION_JOB, RUN_STORE_COVERAGE_SWEEP_JOB, ...ALWAYS_ON].sort());
  });

  it('with every scraping switch off, alerts, billing, notifications and brand jobs still run', async () => {
    const jobs = await scheduledJobs({
      'retailers.liveIngestionScheduleEnabled': false,
      'search.reconciliationScheduleEnabled': false,
      'retailers.storeCoverageSweepEnabled': false,
    });
    expect(jobs).toEqual([...ALWAYS_ON].sort());
  });
});
