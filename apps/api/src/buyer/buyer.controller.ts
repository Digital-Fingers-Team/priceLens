import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { BuyerExtrasService } from './buyer-extras.service';
import { BuyerUserService } from './buyer-user.service';
import { CartWatchService } from './cart-watch.service';
import { CreateCartWatchDto, ReportCouponDto, SetBanksDto, UpdateCartWatchDto } from './dto/buyer.dto';

@ApiTags('buyer')
@Controller('buyer')
export class BuyerController {
  constructor(
    private readonly extras: BuyerExtrasService,
    private readonly user: BuyerUserService,
    private readonly carts: CartWatchService,
  ) {}

  /**
   * Installments, card offers, coupons, warranty and caution for a product.
   * Public: warranty and caution are for everyone; the Pro sections come
   * back locked (with a count) for anyone whose plan lacks them.
   */
  @Public()
  @Get('products/:productId/extras')
  extrasFor(@CurrentUser() user: User | undefined, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.extras.forProduct(productId, user?.id ?? null);
  }

  @Get('banks')
  async banks(@CurrentUser() user: User) {
    const [mine, known] = await Promise.all([this.user.banks(user.id), this.user.knownBanks()]);
    return { mine, known };
  }

  @Put('banks')
  async setBanks(@CurrentUser() user: User, @Body() dto: SetBanksDto) {
    return { mine: await this.user.setBanks(user.id, dto.banks) };
  }

  @Post('coupons/:id/report')
  report(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportCouponDto) {
    return this.user.reportCoupon(user.id, id, dto.worked);
  }

  // ─── Cart watch (Pro) ─────────────────────────────────────────────────

  @RequiresFeature(FEATURES.CART_WATCH)
  @Get('carts')
  listCarts(@CurrentUser() user: User) {
    return this.carts.list(user.id);
  }

  @RequiresFeature(FEATURES.CART_WATCH)
  @Post('carts')
  createCart(@CurrentUser() user: User, @Body() dto: CreateCartWatchDto) {
    return this.carts.create(user.id, dto);
  }

  @RequiresFeature(FEATURES.CART_WATCH)
  @Patch('carts/:id')
  updateCart(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCartWatchDto) {
    return this.carts.update(user.id, id, dto);
  }

  /** Not gated: someone who downgraded can still clear their baskets out. */
  @Delete('carts/:id')
  async deleteCart(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.carts.remove(user.id, id);
    return { ok: true };
  }
}
