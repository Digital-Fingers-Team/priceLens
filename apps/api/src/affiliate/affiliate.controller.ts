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
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { Public, Roles } from '../common/decorators';
import { TokenPayload } from '../auth/interfaces/auth.interfaces';
import { AffiliateConfigService } from './affiliate-config.service';
import { UpsertAffiliateConfigDto } from './dto/affiliate-config.dto';
import { AffiliateService } from './affiliate.service';

@ApiTags('affiliate')
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
    @Body() body: UpsertAffiliateConfigDto,
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

  /**
   * Express resolves req.ip through `trust proxy` (one hop, app.setup.ts). The
   * left-most X-Forwarded-For is whatever the client wrote there (S-13).
   */
  private extractIp(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
