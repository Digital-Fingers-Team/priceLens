import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BillingController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';
import { ManualPaymentsController } from './manual-payments.controller';
import { ManualPaymentsService } from './manual-payments.service';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { RenewalRemindersService } from './renewal-reminders.service';
import { PaymobProvider } from './payments/paymob.provider';
import { MockPaymentProvider } from './payments/mock.provider';
import { PAYMENT_PROVIDERS, PaymentProvider } from './payments/payment-provider';

/**
 * @Global because entitlements are consulted from watchlist, prices,
 * intelligence and (later) the seller and enterprise modules. Making every one
 * of those import BillingModule explicitly invites a module being added
 * without its gate — the global export is the safer default here.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [BillingController, ManualPaymentsController, StripeWebhookController, InvoicesController],
  providers: [
    PlansService,
    SubscriptionsService,
    EntitlementsService,
    StripeService,
    ManualPaymentsService,
    InvoicesService,
    RenewalRemindersService,
    PaymobProvider,
    MockPaymentProvider,
    // Every one-payment-per-period gateway. Adding one is a new class here
    // and a flag in feature-flags.registry.ts.
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (...providers: PaymentProvider[]) => providers,
      inject: [PaymobProvider, MockPaymentProvider],
    },
  ],
  exports: [PlansService, SubscriptionsService, EntitlementsService, StripeService, InvoicesService, RenewalRemindersService],
})
export class BillingModule {}
