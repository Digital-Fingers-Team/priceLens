import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BillingController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * @Global because entitlements are consulted from watchlist, prices,
 * intelligence and (later) the seller and enterprise modules. Making every one
 * of those import BillingModule explicitly invites a module being added
 * without its gate — the global export is the safer default here.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [PlansService, SubscriptionsService, EntitlementsService, StripeService],
  exports: [PlansService, SubscriptionsService, EntitlementsService, StripeService],
})
export class BillingModule {}
