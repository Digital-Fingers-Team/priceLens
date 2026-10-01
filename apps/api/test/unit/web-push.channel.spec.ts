jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
import * as webpush from 'web-push';
import { WebPushChannel, isPushSubscription } from '../../src/notifications/channels/web-push.channel';

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };

function channel(keys = true) {
  const values: Record<string, string> = keys
    ? { 'notifications.webPushPublicKey': 'pub', 'notifications.webPushPrivateKey': 'priv', 'notifications.webPushSubject': 'mailto:x@y.z' }
    : {};
  return new WebPushChannel({ get: (key: string, fallback: string) => values[key] ?? fallback } as never);
}

describe('WebPushChannel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is off, and skips, without VAPID keys', async () => {
    const off = channel(false);
    expect(off.isConfigured()).toBe(false);
    expect(off.publicKey).toBeNull();
    await expect(off.send('', { title: 't', body: 'b' }, { pushSubscription: subscription })).resolves.toMatchObject({ skipped: true });
  });

  it('sends the title, body and link as JSON', async () => {
    (webpush.sendNotification as jest.Mock).mockResolvedValue({});
    await expect(channel().send('', { title: 'Drop', body: 'Now 100', url: 'https://x/p' }, { pushSubscription: subscription })).resolves.toEqual({ ok: true });
    expect(JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1])).toEqual({ title: 'Drop', body: 'Now 100', url: 'https://x/p' });
  });

  it('marks an expired subscription as gone, so it is retired rather than retried', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await expect(channel().send('', { title: 't', body: 'b' }, { pushSubscription: subscription })).resolves.toMatchObject({ ok: false, gone: true });
  });

  it('accepts only https subscriptions with both keys', () => {
    expect(isPushSubscription(subscription)).toBe(true);
    expect(isPushSubscription({ ...subscription, endpoint: 'http://evil' })).toBe(false);
    expect(isPushSubscription({ endpoint: subscription.endpoint, keys: { p256dh: 'p' } })).toBe(false);
  });
});
