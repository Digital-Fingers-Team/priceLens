import { InvoiceStatus, SubscriptionStatus, UserRole } from '@prisma/client';
import { InvoicesService } from '../../src/billing/invoices.service';
import { MockPaymentProvider } from '../../src/billing/payments/mock.provider';
import type { PaymentEvent } from '../../src/billing/payments/payment-provider';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVOICE_ID = '0b6f9f1e-3a51-4c2b-9d4e-1f2a3b4c5d6e';
const plan = { id: 'plan-plus', key: 'plus_monthly', name: 'Plus', priceMinor: 12900, currency: 'EGP', intervalDays: 30, isActive: true, isPublic: true, tier: 'PLUS' };

function build(options: { invoiceStatus?: InvoiceStatus; current?: Record<string, unknown> | null; nodeEnv?: string; flags?: Record<string, boolean> } = {}) {
  const invoice = {
    id: INVOICE_ID,
    userId: 'user-1',
    planId: plan.id,
    provider: 'mock',
    providerRef: `mock_${INVOICE_ID}`,
    amountMinor: 12900,
    currency: 'EGP',
    status: options.invoiceStatus ?? InvoiceStatus.PENDING,
    periodDays: 30,
    plan,
  };
  let claimed = false;
  const prisma = {
    invoice: {
      findFirst: jest.fn(async () => invoice),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: INVOICE_ID, ...data })),
      update: jest.fn(async () => invoice),
      updateMany: jest.fn(async ({ where }: { where: { status: unknown } }) => {
        const allowed = (where.status as { in?: InvoiceStatus[] }).in ?? [where.status as InvoiceStatus];
        if (!allowed.includes(invoice.status) || claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      }),
    },
    subscription: { updateMany: jest.fn() },
  };
  const subscriptions = {
    getActiveForUser: jest.fn(async () => options.current ?? null),
    grantPlan: jest.fn(async () => ({})),
  };
  const notifications = { dispatch: jest.fn(async () => ({})) };
  const flags = { isEnabled: jest.fn(async (key: string) => (options.flags ?? { mock_checkout: true, paymob_checkout: true })[key] ?? false) };
  const values: Record<string, unknown> = { 'app.nodeEnv': options.nodeEnv ?? 'test', 'auth.jwtAccessSecret': 'x'.repeat(32) };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)),
    getOrThrow: jest.fn((key: string) => values[key]),
  };
  const mock = new MockPaymentProvider(config as never);
  const paymob = { id: 'paymob', isConfigured: () => false };
  const plans = { findByKey: jest.fn(async () => plan) };
  const service = new InvoicesService(
    prisma as never,
    plans as never,
    subscriptions as never,
    notifications as never,
    flags as never,
    config as never,
    [paymob as never, mock],
  );
  return { service, prisma, subscriptions, invoice };
}

const paid = (overrides: Partial<PaymentEvent> = {}): PaymentEvent => ({
  invoiceId: INVOICE_ID,
  providerRef: `mock_${INVOICE_ID}`,
  eventId: 'evt-1',
  outcome: 'PAID',
  amountMinor: 12900,
  currency: 'EGP',
  ...overrides,
});

describe('InvoicesService', () => {
  it('grants the plan once for a paid invoice, even if the event is delivered twice', async () => {
    const { service, subscriptions } = build();
    await expect(service.settle('mock', paid())).resolves.toEqual({ invoiceId: INVOICE_ID, status: 'PAID' });
    await service.settle('mock', paid());
    expect(subscriptions.grantPlan).toHaveBeenCalledTimes(1);
    expect(subscriptions.grantPlan).toHaveBeenCalledWith('user-1', 'plus_monthly', expect.objectContaining({ provider: 'mock' }));
  });

  it('refuses to grant when the paid amount differs from the invoice', async () => {
    const { service, subscriptions } = build();
    await expect(service.settle('mock', paid({ amountMinor: 100 }))).resolves.toMatchObject({ status: 'FAILED' });
    expect(subscriptions.grantPlan).not.toHaveBeenCalled();
  });

  it('adds a full period on top of an unexpired period of the same plan', async () => {
    const end = new Date(Date.now() + 10 * DAY_MS);
    const start = new Date(Date.now() - 20 * DAY_MS);
    const { service, subscriptions } = build({
      current: { planId: plan.id, status: SubscriptionStatus.ACTIVE, currentPeriodStart: start, currentPeriodEnd: end },
    });
    await service.settle('mock', paid());
    const options = (subscriptions.grantPlan.mock.calls[0] as unknown[])[2] as { currentPeriodStart: Date; currentPeriodEnd: Date };
    expect(options.currentPeriodStart).toEqual(start);
    expect(options.currentPeriodEnd.getTime()).toBe(end.getTime() + 30 * DAY_MS);
  });

  it('marks a decline FAILED without touching the subscription', async () => {
    const { service, subscriptions, prisma } = build();
    await expect(service.settle('mock', paid({ outcome: 'FAILED' }))).resolves.toMatchObject({ status: 'FAILED' });
    expect(prisma.invoice.updateMany).toHaveBeenCalled();
    expect(subscriptions.grantPlan).not.toHaveBeenCalled();
  });

  it('records a refund of a paid invoice for review instead of downgrading', async () => {
    const { service, subscriptions } = build({ invoiceStatus: InvoiceStatus.PAID });
    await expect(service.settle('mock', paid({ outcome: 'FAILED' }))).resolves.toMatchObject({ status: 'REFUNDED' });
    expect(subscriptions.grantPlan).not.toHaveBeenCalled();
  });

  it('offers the test double only while its flag is on, and in production only to admins', async () => {
    expect(await build().service.availableProviders({ role: UserRole.USER })).toEqual(['mock']);
    expect(await build({ flags: { mock_checkout: false } }).service.availableProviders({ role: UserRole.USER })).toEqual([]);
    expect(await build({ nodeEnv: 'production' }).service.availableProviders({ role: UserRole.USER })).toEqual([]);
    expect(await build({ nodeEnv: 'production' }).service.availableProviders({ role: UserRole.ADMIN })).toEqual(['mock']);
  });

  it('does not offer an unconfigured gateway even with its flag on', async () => {
    expect(await build().service.availableProviders(null)).not.toContain('paymob');
  });

  it('round-trips a mock event through its signature check', () => {
    const config = { getOrThrow: () => 'y'.repeat(32), get: () => 'http://localhost:3000' };
    const mock = new MockPaymentProvider(config as never);
    const body = { invoiceId: INVOICE_ID, outcome: 'PAID', amountMinor: 1, currency: 'EGP', signature: mock.sign(INVOICE_ID, 'PAID') };
    expect(mock.parseWebhook({ body, query: {}, headers: {} }).outcome).toBe('PAID');
    expect(() => mock.parseWebhook({ body: { ...body, outcome: 'FAILED' }, query: {}, headers: {} })).toThrow();
  });
});
