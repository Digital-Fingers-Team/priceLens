import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ManualPayment, Plan, User, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import {
  ListManualPaymentsQueryDto,
  RejectManualPaymentDto,
  StartManualPaymentDto,
  SubmitManualPaymentDto,
} from './dto/billing.dto';
import { ManualPaymentsService } from './manual-payments.service';

/**
 * Wallet / InstaPay payments: the customer orders, pays outside the site,
 * enters the transfer reference; the owner approves in /admin/payments.
 */
@ApiTags('billing')
@Controller('billing/payments')
export class ManualPaymentsController {
  constructor(private readonly payments: ManualPaymentsService) {}

  /** Open (or reuse) the order for a plan, with where to send the money. */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async start(@CurrentUser() user: User, @Body() dto: StartManualPaymentDto) {
    const payment = await this.payments.startOrder(user.id, dto.planKey);
    return { payment: toView(payment), destinations: this.payments.destinations() };
  }

  @Get('mine')
  async mine(@CurrentUser() user: User) {
    const payments = await this.payments.listMine(user.id);
    return { payments: payments.map(toView), destinations: this.payments.destinations() };
  }

  @Post(':id/submit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitManualPaymentDto,
  ) {
    return toView(await this.payments.submit(user.id, id, dto));
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return toView(await this.payments.cancel(user.id, id));
  }

  // ─── Admin ──────────────────────────────────────────────────────────────

  @Roles(UserRole.ADMIN)
  @Get('admin')
  async adminList(@Query() query: ListManualPaymentsQueryDto) {
    const payments = await this.payments.adminList(query.status);
    return {
      payments: payments.map((payment) => ({
        ...toView(payment),
        payerAccount: payment.payerAccount,
        reviewedAt: payment.reviewedAt?.toISOString() ?? null,
        user: payment.user,
      })),
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/:id/approve')
  async approve(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string) {
    return toView(await this.payments.approve(actor.id, id));
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/:id/reject')
  async reject(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectManualPaymentDto,
  ) {
    return toView(await this.payments.reject(actor.id, id, dto.reason));
  }
}

function toView(payment: ManualPayment & { plan: Plan }) {
  return {
    id: payment.id,
    code: payment.code,
    status: payment.status,
    planKey: payment.plan.key,
    planName: payment.plan.name,
    tier: payment.plan.tier,
    intervalDays: payment.plan.intervalDays,
    amountMinor: payment.amountMinor,
    amount: payment.amountMinor / 100,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    submittedAt: payment.submittedAt?.toISOString() ?? null,
    rejectReason: payment.rejectReason,
    createdAt: payment.createdAt.toISOString(),
  };
}
