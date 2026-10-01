import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BuyerAdminController } from './buyer-admin.controller';
import { BuyerAdminService } from './buyer-admin.service';
import { BuyerController } from './buyer.controller';
import { BuyerExtrasService } from './buyer-extras.service';
import { BuyerUserService } from './buyer-user.service';
import { CartWatchService } from './cart-watch.service';

/** v2 phase 3: the buyer tools around the price (installments, offers, warranty, cart watch). */
@Module({
  imports: [DatabaseModule],
  controllers: [BuyerController, BuyerAdminController],
  providers: [BuyerExtrasService, BuyerAdminService, BuyerUserService, CartWatchService],
  exports: [CartWatchService, BuyerExtrasService],
})
export class BuyerModule {}
