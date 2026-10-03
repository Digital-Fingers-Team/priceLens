import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SearchModule } from '../search/search.module';
import { SellerModule } from '../seller/seller.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [DatabaseModule, SellerModule, SearchModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}
