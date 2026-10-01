import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * A pretend gateway for development, tests and the post-deploy smoke test.
 *
 * Its "hosted page" is our own /account/pay/test/:invoiceId, whose buttons
 * post a signed event to the same webhook path a real gateway uses, so the
 * whole settle-and-grant path runs for real. Only usable while the
 * `mock_checkout` flag is on (off by default), and in production only by an
 * admin (InvoicesService enforces both).
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const frontend = this.config.get<string>('app.frontendUrl', 'http://localhost:3000').replace(/\/$/, '');
    return { redirectUrl: `${frontend}/account/pay/test/${request.invoiceId}`, providerRef: `mock_${request.invoiceId}` };
  }

  /** What the test page's buttons send. Keyed on the access-token secret with its own prefix, so it cannot be confused with a token. */
  sign(invoiceId: string, outcome: 'PAID' | 'FAILED'): string {
    return createHmac('sha256', this.secret()).update(`mock-checkout:${invoiceId}:${outcome}`).digest('hex');
  }

  parseWebhook({ body }: WebhookInput): PaymentEvent {
    const payload = (body ?? {}) as Record<string, unknown>;
    const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : '';
    const outcome = payload.outcome === 'PAID' ? 'PAID' : payload.outcome === 'FAILED' ? 'FAILED' : null;
    const signature = typeof payload.signature === 'string' ? payload.signature : '';
    if (!invoiceId || !outcome) throw new InvalidWebhookError('Malformed mock event');

    const expected = Buffer.from(this.sign(invoiceId, outcome));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new InvalidWebhookError('Mock signature does not match');
    }

    return {
      invoiceId,
      providerRef: `mock_${invoiceId}`,
      eventId: `mock_${invoiceId}_${outcome}`,
      outcome,
      amountMinor: Number(payload.amountMinor ?? 0),
      currency: String(payload.currency ?? ''),
      failureReason: outcome === 'FAILED' ? 'Test payment declined' : undefined,
    };
  }

  private secret(): string {
    return this.config.getOrThrow<string>('auth.jwtAccessSecret');
  }
}
