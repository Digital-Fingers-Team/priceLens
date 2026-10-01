import { BadRequestException, Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { User } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import { InvoicesService } from './invoices.service';
import { StartInvoiceCheckoutDto, TestPayDto } from './dto/billing.dto';
import { PaymobProvider } from './payments/paymob.provider';
import { MockPaymentProvider } from './payments/mock.provider';
import { InvalidWebhookError } from './payments/payment-provider';

@ApiTags('billing')
@Controller('billing')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    private readonly invoices: InvoicesService,
    private readonly paymob: PaymobProvider,
    private readonly mock: MockPaymentProvider,
  ) {}

  /** Online gateways this user can pay with right now. */
  @Get('providers')
  async providers(@CurrentUser() user: User) {
    return { providers: await this.invoices.availableProviders(user) };
  }

  @Post('invoices/checkout')
  checkout(@CurrentUser() user: User, @Body() dto: StartInvoiceCheckoutDto) {
    return this.invoices.startCheckout(user, dto.planKey, dto.provider);
  }

  @Get('invoices')
  async list(@CurrentUser() user: User) {
    return { invoices: await this.invoices.listMine(user.id) };
  }

  @Get('invoices/:id')
  async get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const invoice = await this.invoices.getMine(user.id, id);
    return {
      id: invoice.id,
      provider: invoice.provider,
      planKey: invoice.plan.key,
      planName: invoice.plan.name,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      status: invoice.status,
      failureReason: invoice.failureReason,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
    };
  }

  /**
   * The test double's "Pay" / "Decline" buttons. The event is signed and then
   * parsed back through the provider, so this exercises the same verify +
   * settle path a real gateway callback takes.
   */
  @Post('invoices/:id/test-pay')
  async testPay(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TestPayDto) {
    const invoice = await this.invoices.assertMockInvoice(user, id);
    const event = this.mock.parseWebhook({
      body: {
        invoiceId: invoice.id,
        outcome: dto.outcome,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        signature: this.mock.sign(invoice.id, dto.outcome),
      },
      query: {},
      headers: {},
    });
    return this.invoices.settle('mock', event);
  }

  /**
   * Paymob's transaction-processed callback. Public: Paymob cannot present a
   * JWT; the HMAC is the authentication and it fails closed. Answers 200 for
   * anything verified, even an event we ignore, so Paymob stops retrying it.
   */
  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Post('webhook/paymob')
  async paymobWebhook(@Req() request: Request, @Query() query: Record<string, unknown>) {
    try {
      const event = this.paymob.parseWebhook({ body: request.body, query, headers: request.headers });
      const result = await this.invoices.settle('paymob', event);
      return { received: true, ...result };
    } catch (error) {
      if (error instanceof InvalidWebhookError) {
        this.logger.warn(`Rejected a Paymob callback: ${error.message}`);
        throw new BadRequestException('Invalid callback');
      }
      throw error;
    }
  }
}
