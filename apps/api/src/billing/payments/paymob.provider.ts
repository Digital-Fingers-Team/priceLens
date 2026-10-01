import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CheckoutRequest,
  CheckoutSession,
  InvalidWebhookError,
  PaymentEvent,
  PaymentProvider,
  WebhookInput,
} from './payment-provider';

/**
 * The fields Paymob signs on a transaction callback, in the order it signs
 * them (Paymob docs, "HMAC Calculation – Transaction Processed Callback").
 */
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function pick(object: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
    object,
  );
}

/** Paymob concatenates the values as strings; booleans as "true"/"false". */
export function paymobSignature(transaction: unknown, secret: string): string {
  const message = HMAC_FIELDS.map((field) => {
    const value = pick(transaction, field);
    return value === undefined || value === null ? '' : String(value);
  }).join('');
  return createHmac('sha512', secret).update(message).digest('hex');
}

/**
 * Paymob, Egypt's card / mobile-wallet / Fawry gateway, through its Intention
 * API and Unified Checkout page.
 *
 * Inert until PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET and at
 * least one PAYMOB_INTEGRATION_IDS entry are set: isConfigured() is false and
 * the pricing page does not offer it.
 */
@Injectable()
export class PaymobProvider implements PaymentProvider {
  readonly id = 'paymob';
  private readonly logger = new Logger(PaymobProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get settings() {
    return {
      baseUrl: this.config.get<string>('billing.paymobBaseUrl', 'https://accept.paymob.com').replace(/\/$/, ''),
      secretKey: this.config.get<string>('billing.paymobSecretKey', ''),
      publicKey: this.config.get<string>('billing.paymobPublicKey', ''),
      hmacSecret: this.config.get<string>('billing.paymobHmacSecret', ''),
      integrationIds: this.config.get<number[]>('billing.paymobIntegrationIds', []),
    };
  }

  isConfigured(): boolean {
    const s = this.settings;
    return Boolean(s.secretKey && s.publicKey && s.hmacSecret && s.integrationIds.length > 0);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const s = this.settings;
    const [firstName, ...rest] = (request.customer.name || request.customer.email).split(/\s+/);

    const { data } = await axios.post<{ client_secret: string; intention_order_id?: number; id?: string }>(
      `${s.baseUrl}/v1/intention/`,
      {
        amount: request.amountMinor,
        currency: request.currency,
        payment_methods: s.integrationIds,
        items: [{ name: request.plan.name.slice(0, 50), amount: request.amountMinor, quantity: 1 }],
        // Paymob requires these fields; it accepts "NA" for the ones a
        // subscription purchase has no use for.
        billing_data: {
          first_name: firstName || 'NA',
          last_name: rest.join(' ') || 'NA',
          email: request.customer.email,
          phone_number: 'NA',
          street: 'NA',
          building: 'NA',
          floor: 'NA',
          apartment: 'NA',
          city: 'NA',
          country: 'EG',
        },
        special_reference: request.invoiceId,
        notification_url: request.webhookUrl,
        redirection_url: request.returnUrl,
        extras: { invoice_id: request.invoiceId, plan_key: request.plan.key },
      },
      { headers: { Authorization: `Token ${s.secretKey}` }, timeout: 15_000 },
    );

    const redirectUrl =
      `${s.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(s.publicKey)}` +
      `&clientSecret=${encodeURIComponent(data.client_secret)}`;
    return { redirectUrl, providerRef: data.intention_order_id != null ? String(data.intention_order_id) : null };
  }

  parseWebhook({ body, query }: WebhookInput): PaymentEvent {
    const payload = (body ?? {}) as { type?: string; obj?: Record<string, unknown> };
    const transaction = payload.obj;
    if (payload.type !== 'TRANSACTION' || !transaction) {
      throw new InvalidWebhookError('Not a Paymob transaction callback');
    }

    const received = typeof query.hmac === 'string' ? query.hmac : '';
    const expected = paymobSignature(transaction, this.settings.hmacSecret);
    const a = Buffer.from(received, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (!this.settings.hmacSecret || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new InvalidWebhookError('Paymob HMAC does not match');
    }

    const success = transaction.success === true;
    const pending = transaction.pending === true;
    const refunded = transaction.is_refunded === true || transaction.is_voided === true;
    const merchantOrderId = pick(transaction, 'order.merchant_order_id');
    const orderId = pick(transaction, 'order.id');

    const outcome = refunded ? 'FAILED' : success ? 'PAID' : pending ? 'PENDING' : 'FAILED';
    if (refunded) this.logger.warn(`Paymob transaction ${String(transaction.id)} was refunded or voided`);

    return {
      invoiceId: typeof merchantOrderId === 'string' && merchantOrderId ? merchantOrderId : null,
      providerRef: orderId != null ? String(orderId) : null,
      eventId: `txn_${String(transaction.id)}`,
      outcome,
      amountMinor: Number(transaction.amount_cents ?? 0),
      currency: String(transaction.currency ?? ''),
      failureReason: outcome === 'FAILED' ? String(pick(transaction, 'data.message') ?? 'Payment declined').slice(0, 255) : undefined,
    };
  }
}
