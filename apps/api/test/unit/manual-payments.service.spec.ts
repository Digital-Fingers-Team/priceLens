import { ConflictException } from '@nestjs/common';
import { ManualPaymentMethod, ManualPaymentStatus, PlanTier, Prisma, SubscriptionStatus } from '@prisma/client';
import { ManualPaymentsService, normaliseReference } from '../../src/billing/manual-payments.service';
import { UpgradeRequiredException } from '../../src/billing/billing.errors';

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T00:00:00Z');

const plus = { id: 'plan-plus', key: 'plus_monthly', name: 'Plus', tier: PlanTier.PLUS, priceMinor: 12900, currency: 'EGP', intervalDays: 30, isActive: true };
const enterprise = { ...plus, id: 'plan-ent', key: 'enterprise_monthly', tier: PlanTier.ENTERPRISE, priceMinor: 1_500_000 };

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    code: 'PL-1234',
    userId: 'u1',
    planId: plus.id,
    plan: plus,
    amountMinor: 12900,
    currency: 'EGP',
    status: ManualPaymentStatus.SUBMITTED,
    method: ManualPaymentMethod.WALLET,
    reference: 'ABC123',
    payerAccount: null,
    submittedAt: NOW,
    rejectReason: null,
    createdAt: NOW,
    ...overrides,
  };
}

function setup(options: { settings?: Record<string, string>; current?: unknown; row?: unknown } = {}) {
  const settings: Record<string, string> = { 'billing.walletNumber': '01000000000', ...options.settings };
  const row = options.row ?? payment();
  const prisma = {
    manualPayment: {
      findUnique: jest.fn(async () => row),
      findUniqueOrThrow: jest.fn(async () => row),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...payment(), ...data, status: ManualPaymentStatus.AWAITING_PAYMENT })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...(row as object), ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: jest.fn(async () => ({ email: 'a@b.c', displayName: null })) },
  };
  const plans = { findByKey: jest.fn(async (key: string) => (key === enterprise.key ? enterprise : plus)) };
  const subscriptions = {
    getActiveForUser: jest.fn(async () => options.current ?? null),
    grantPlan: jest.fn(async () => ({ id: 's1' })),
  };
  const notifications = { dispatch: jest.fn(async () => ({})) };
  const config = { get: (key: string, fallback?: string) => settings[key] ?? fallback };
  const svc = new ManualPaymentsService(prisma as never, plans as never, subscriptions as never, notifications as never, config as never);
  return { svc, prisma, subscriptions, notifications };
}

describe('ManualPaymentsService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('is off without a wallet number or InstaPay address', async () => {
    const { svc } = setup({ settings: { 'billing.walletNumber': '' } });
    expect(svc.isEnabled).toBe(false);
    expect(svc.destinations()).toBeNull();
    await expect(svc.startOrder('u1', 'plus_monthly')).rejects.toBeInstanceOf(UpgradeRequiredException);
  });

  it('does not sell Enterprise by wallet', async () => {
    const { svc } = setup();
    expect(svc.isSellable(plus)).toBe(true);
    expect(svc.isSellable(enterprise)).toBe(false);
    await expect(svc.startOrder('u1', 'enterprise_monthly')).rejects.toBeInstanceOf(UpgradeRequiredException);
  });

  it('copies the plan price into a new order', async () => {
    const { svc, prisma } = setup();
    await svc.startOrder('u1', 'plus_monthly');
    expect(prisma.manualPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', planId: plus.id, amountMinor: 12900, currency: 'EGP' }) }),
    );
  });

  it('reuses the open order for the same plan instead of making a new code', async () => {
    const { svc, prisma } = setup();
    const open = payment({ status: ManualPaymentStatus.AWAITING_PAYMENT });
    prisma.manualPayment.findFirst.mockResolvedValueOnce(open as never);
    await expect(svc.startOrder('u1', 'plus_monthly')).resolves.toBe(open);
    expect(prisma.manualPayment.create).not.toHaveBeenCalled();
  });

  it('refuses a transfer number another order already used', async () => {
    const { svc, prisma } = setup({ row: payment({ status: ManualPaymentStatus.AWAITING_PAYMENT }) });
    prisma.manualPayment.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      svc.submit('u1', 'pay-1', { method: ManualPaymentMethod.WALLET, reference: 'abc 123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses InstaPay when only a wallet number is set', async () => {
    const { svc } = setup({ row: payment({ status: ManualPaymentStatus.AWAITING_PAYMENT }) });
    await expect(
      svc.submit('u1', 'pay-1', { method: ManualPaymentMethod.INSTAPAY, reference: 'ABC123' }),
    ).rejects.toThrow('not available');
  });

  it('approving grants the plan for its interval from now', async () => {
    const { svc, subscriptions } = setup();
    await svc.approve('admin', 'pay-1');
    expect(subscriptions.grantPlan).toHaveBeenCalledWith('u1', 'plus_monthly', {
      provider: 'wallet',
      eventType: 'wallet_payment',
      providerEventId: 'pay-1',
      currentPeriodStart: NOW,
      currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
    });
  });

  it('an early renewal adds the new period on top of the days left', async () => {
    const end = new Date(NOW.getTime() + 5 * DAY);
    const start = new Date(NOW.getTime() - 25 * DAY);
    const { svc, subscriptions } = setup({
      current: { planId: plus.id, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
    });
    await svc.approve('admin', 'pay-1');
    expect(subscriptions.grantPlan).toHaveBeenCalledWith(
      'u1',
      'plus_monthly',
      expect.objectContaining({ currentPeriodStart: start, currentPeriodEnd: new Date(end.getTime() + 30 * DAY) }),
    );
  });

  it('a second approval of the same payment grants nothing', async () => {
    const { svc, prisma, subscriptions } = setup();
    prisma.manualPayment.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.approve('admin', 'pay-1')).rejects.toBeInstanceOf(ConflictException);
    expect(subscriptions.grantPlan).not.toHaveBeenCalled();
  });

  it('puts the payment back when granting fails', async () => {
    const { svc, prisma, subscriptions } = setup();
    subscriptions.grantPlan.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.approve('admin', 'pay-1')).rejects.toThrow('db down');
    expect(prisma.manualPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: ManualPaymentStatus.SUBMITTED, reviewedById: null, reviewedAt: null },
    });
  });

  it('compares transfer numbers without spaces, dashes or case', () => {
    expect(normaliseReference(' ab-12 34 ')).toBe('AB1234');
  });
});
