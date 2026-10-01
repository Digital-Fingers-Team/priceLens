import { PaymobProvider, paymobSignature } from '../../src/billing/payments/paymob.provider';
import { InvalidWebhookError } from '../../src/billing/payments/payment-provider';

const SECRET = 'hmac-secret-for-tests';

function provider(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'billing.paymobSecretKey': 'sk',
    'billing.paymobPublicKey': 'pk',
    'billing.paymobHmacSecret': SECRET,
    'billing.paymobIntegrationIds': [111],
    ...overrides,
  };
  const config = { get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)) };
  return new PaymobProvider(config as never);
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 9001,
    amount_cents: 12900,
    created_at: '2026-10-01T10:00:00.000000',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 111,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 555, merchant_order_id: '0b6f9f1e-3a51-4c2b-9d4e-1f2a3b4c5d6e' },
    owner: 42,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
    ...overrides,
  };
}

describe('PaymobProvider', () => {
  it('is not offered until every key is set', () => {
    expect(provider().isConfigured()).toBe(true);
    expect(provider({ 'billing.paymobHmacSecret': '' }).isConfigured()).toBe(false);
    expect(provider({ 'billing.paymobIntegrationIds': [] }).isConfigured()).toBe(false);
  });

  it('signs the documented fields in order, booleans as words', () => {
    // Independent reconstruction of Paymob's concatenation for this payload.
    const message =
      '12900' + '2026-10-01T10:00:00.000000' + 'EGP' + 'false' + 'false' + '9001' + '111' + 'true' + 'false' +
      'false' + 'false' + 'true' + 'false' + '555' + '42' + 'false' + '2346' + 'MasterCard' + 'card' + 'true';
    const { createHmac } = jest.requireActual<typeof import('crypto')>('crypto');
    expect(paymobSignature(transaction(), SECRET)).toBe(createHmac('sha512', SECRET).update(message).digest('hex'));
  });

  it('accepts a correctly signed success and names our invoice', () => {
    const obj = transaction();
    const event = provider().parseWebhook({
      body: { type: 'TRANSACTION', obj },
      query: { hmac: paymobSignature(obj, SECRET) },
      headers: {},
    });
    expect(event).toMatchObject({
      invoiceId: '0b6f9f1e-3a51-4c2b-9d4e-1f2a3b4c5d6e',
      providerRef: '555',
      eventId: 'txn_9001',
      outcome: 'PAID',
      amountMinor: 12900,
      currency: 'EGP',
    });
  });

  it('rejects a tampered amount', () => {
    const obj = transaction();
    const hmac = paymobSignature(obj, SECRET);
    expect(() =>
      provider().parseWebhook({ body: { type: 'TRANSACTION', obj: { ...obj, amount_cents: 100 } }, query: { hmac }, headers: {} }),
    ).toThrow(InvalidWebhookError);
  });

  it('rejects a missing signature and a non-transaction body', () => {
    expect(() => provider().parseWebhook({ body: { type: 'TRANSACTION', obj: transaction() }, query: {}, headers: {} })).toThrow(
      InvalidWebhookError,
    );
    expect(() => provider().parseWebhook({ body: { type: 'TOKEN', obj: {} }, query: { hmac: 'x' }, headers: {} })).toThrow(
      InvalidWebhookError,
    );
  });

  it('reads a decline, a pending payment and a refund', () => {
    const parse = (obj: Record<string, unknown>) =>
      provider().parseWebhook({ body: { type: 'TRANSACTION', obj }, query: { hmac: paymobSignature(obj, SECRET) }, headers: {} });
    expect(parse(transaction({ success: false })).outcome).toBe('FAILED');
    expect(parse(transaction({ success: false, pending: true })).outcome).toBe('PENDING');
    expect(parse(transaction({ is_refunded: true })).outcome).toBe('FAILED');
  });
});
