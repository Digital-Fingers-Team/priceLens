import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { Public, Roles } from '../common/decorators';
import { TokenPayload } from '../auth/interfaces/auth.interfaces';
import { AffiliateConfigService, UpsertAffiliateConfigInput } from './affiliate-config.service';
import { AffiliateService } from './affiliate.service';

@Controller('affiliate')
export class AffiliateController {
  constructor(
    private readonly affiliateService: AffiliateService,
    private readonly affiliateConfigService: AffiliateConfigService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The only way out to a retailer's site. Always records a click and
   * always redirects through the generated affiliate URL -- never the raw
   * SourceListing.externalUrl directly. Public: anonymous visitors can
   * click "Go to Store" too, so auth here is best-effort (see
   * extractOptionalUserId), not required.
   */
  @Public()
  @Get('go/:listingId')
  async goToStore(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.extractOptionalUserId(req);

    const affiliateUrl = await this.affiliateService.createRedirect({
      sourceListingId: listingId,
      userId,
      ip: this.extractIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.redirect(HttpStatus.FOUND, affiliateUrl);
  }

  @Roles(UserRole.ADMIN)
  @Get('configs')
  listConfigs() {
    return this.affiliateConfigService.list();
  }

  @Roles(UserRole.ADMIN)
  @Put('configs/:platformId')
  upsertConfig(
    @Param('platformId', ParseUUIDPipe) platformId: string,
    @Body() body: UpsertAffiliateConfigInput,
  ) {
    return this.affiliateConfigService.upsert(platformId, body);
  }

  /** Best-effort JWT decode -- an anonymous or expired/invalid token never blocks the redirect. */
  private async extractOptionalUserId(req: Request): Promise<string | undefined> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;

    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(
        authHeader.slice('Bearer '.length),
        { secret: this.configService.get<string>('auth.jwtAccessSecret') },
      );
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  private extractIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
