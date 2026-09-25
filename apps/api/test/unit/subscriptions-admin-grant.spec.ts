import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from '../../src/billing/subscriptions.service';

describe('SubscriptionsService.adminGrantPlan', () => {
  function service(userExists: boolean) {
    const prisma = { user: { findUnique: jest.fn(async () => (userExists ? { id: 'u1' } : null)) } };
    const svc = new SubscriptionsService(prisma as never, {} as never, {} as never);
    const grantPlan = jest.spyOn(svc, 'grantPlan').mockResolvedValue({ id: 's1' } as never);
    return { svc, grantPlan };
  }

  it('answers 404 for an unknown user (it used to be a 403 "upgrade required")', async () => {
    const { svc, grantPlan } = service(false);
    await expect(svc.adminGrantPlan('missing', 'pro')).rejects.toBeInstanceOf(NotFoundException);
    expect(grantPlan).not.toHaveBeenCalled();
  });

  it('grants a manual plan from now, for the given number of days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const { svc, grantPlan } = service(true);
      await svc.adminGrantPlan('u1', 'pro', 30);
      expect(grantPlan).toHaveBeenCalledWith('u1', 'pro', {
        provider: 'manual',
        eventType: 'manual_grant',
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-01-31T00:00:00Z'),
      });

      await svc.adminGrantPlan('u1', 'pro');
      expect(grantPlan).toHaveBeenLastCalledWith('u1', 'pro', {
        provider: 'manual',
        eventType: 'manual_grant',
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
