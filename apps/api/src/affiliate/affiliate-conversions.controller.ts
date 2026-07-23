import { timingSafeEqual } from 'crypto';
import { Body, Controller, Get, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { UserRole } from '@prisma/client';
import { Public, Roles } from '../common/decorators';
import { AFFILIATE_CONVERSION_QUEUE, RUN_CONVERSION_POLL_JOB } from './affiliate.constants';
import { ConversionReconciliationService } from './conversion-reconciliation.service';

@Controller('affiliate/conversions')
export class AffiliateConversionsController {
  constructor(
    private readonly reconciliationService: ConversionReconciliationService,
    private readonly configService: ConfigService,
    @InjectQueue(AFFILIATE_CONVERSION_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Inbound postback target: register this URL (with ?secret=... baked in)
   * as the network's Action Tracker / postback callback. Public route, but
   * the shared secret stands in for real request auth since the network
   * calls this anonymously.
   */
  @Public()
  @Post('webhook/:networkKey')
  async handleWebhook(
    @Param('networkKey') networkKey: string,
    @Query('secret') secret: string | undefined,
    @Query() query: Record<string, string>,
    @Body() body: Record<string, unknown>,
  ) {
    this.verifyWebhookSecret(secret);
    const queryParams = { ...query };
    delete queryParams.secret;
    const reconciled = await this.reconciliationService.handleWebhook(networkKey, {
      ...queryParams,
      ...body,
    });
    return { reconciled };
  }

  @Roles(UserRole.ADMIN)
  @Post('poll')
  async triggerPoll() {
    const job = await this.queue.add(
      RUN_CONVERSION_POLL_JOB,
      {},
      {
        jobId: `manual-affiliate-conversion-poll:${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return { queued: true, jobId: String(job.id) };
  }

  @Roles(UserRole.ADMIN)
  @Get()
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REVERSED') {
    return this.reconciliationService.list(status);
  }

  @Roles(UserRole.ADMIN)
  @Get('summary')
  summary() {
    return this.reconciliationService.summary();
  }

  private verifyWebhookSecret(secret: string | undefined): void {
    const expected = this.configService.get<string>('affiliate.conversionWebhookSecret', '');
    if (!expected) {
      throw new UnauthorizedException('Conversion webhook secret not configured');
    }

    const provided = Buffer.from(secret ?? '');
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
