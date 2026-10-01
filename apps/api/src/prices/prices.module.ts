import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { PricesController } from './prices.controller';
import { PriceRollupService } from './price-rollup.service';

@Module({
  imports: [ProductsModule],
  controllers: [PricesController],
  providers: [PriceRollupService],
  exports: [PriceRollupService],
})
export class PricesModule {}
