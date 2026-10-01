import { NotificationChannelType, NotificationStatus } from '@prisma/client';
import { NotificationsService } from '../../src/notifications/notifications.service';

function build(options: { flagOn: boolean; features: string[] }) {
  const deliveries: Array<Record<string, unknown>> = [];
  const prisma = {
    notification: { findFirst: jest.fn(), count: jest.fn(async () => 0), create: jest.fn(async () => ({ id: 'n1' })) },
    notificationChannel: {
      findMany: jest.fn(async () => [
        { id: 'c-email', type: NotificationChannelType.EMAIL, destination: 'a@b.co', isActive: true, verified: true, failureCount: 0 },
      ]),
      update: jest.fn(),
    },
    notificationDelivery: {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => deliveries.push(create)),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const entitlements = {
    getEntitlements: jest.fn(async () => ({ limits: { features: options.features, notificationChannels: ['IN_APP', 'EMAIL'] } })),
  };
  const flags = { isEnabled: jest.fn(async () => options.flagOn) };
  const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };
  const driver = (type: NotificationChannelType) => ({ type, isConfigured: () => true, send: jest.fn(async () => ({ ok: true })) });
  const inApp = driver(NotificationChannelType.IN_APP);
  const email = driver(NotificationChannelType.EMAIL);
  const service = new NotificationsService(
    prisma as never,
    config as never,
    entitlements as never,
    flags as never,
    inApp as never,
    email as never,
    driver(NotificationChannelType.TELEGRAM) as never,
    driver(NotificationChannelType.WEB_PUSH) as never,
  );
  return { service, prisma, email, deliveries };
}

const alert = { userId: 'u1', type: 'price_alert.triggered', title: 'Drop', body: 'Now 100', digestable: true };

describe('alert digest', () => {
  it('holds a free plan alert email for the digest while realtime_alerts is on', async () => {
    const { service, email, deliveries } = build({ flagOn: true, features: [] });
    const result = await service.dispatch(alert);
    expect(email.send).not.toHaveBeenCalled();
    expect(result.queued).toEqual([NotificationChannelType.EMAIL]);
    expect(deliveries.find((d) => d.channelType === NotificationChannelType.EMAIL)?.status).toBe(NotificationStatus.PENDING);
  });

  it('sends at once for a plan with real-time alerts', async () => {
    const { service, email } = build({ flagOn: true, features: ['realtime_alerts'] });
    await service.dispatch(alert);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('sends at once for everyone while the flag is off (the old behaviour)', async () => {
    const { service, email } = build({ flagOn: false, features: [] });
    await service.dispatch(alert);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('never holds a message that is not digestable', async () => {
    const { service, email } = build({ flagOn: true, features: [] });
    await service.dispatch({ ...alert, type: 'billing.payment_received', digestable: false });
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('sends one email per user for everything held', async () => {
    const { service, prisma, email } = build({ flagOn: true, features: [] });
    const channel = { destination: 'a@b.co', isActive: true, verified: true };
    prisma.notificationDelivery.findMany.mockResolvedValue([
      { id: 'd1', notification: { userId: 'u1', title: 'A', body: 'a', url: null }, channel },
      { id: 'd2', notification: { userId: 'u1', title: 'B', body: 'b', url: 'https://x/b' }, channel },
      { id: 'd3', notification: { userId: 'u2', title: 'C', body: 'c', url: null }, channel: null },
    ] as never);

    await expect(service.sendDailyDigests()).resolves.toEqual({ users: 1, alerts: 3 });
    expect(email.send).toHaveBeenCalledTimes(1);
    const [, message] = (email.send.mock.calls[0] as unknown[]) as [string, { title: string; body: string }];
    expect(message.title).toContain('(2)');
    expect(message.body).toContain('https://x/b');
    // u2 has no usable address: SKIPPED, not left PENDING.
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['d3'] } }, data: expect.objectContaining({ status: NotificationStatus.SKIPPED }) }),
    );
  });
});
