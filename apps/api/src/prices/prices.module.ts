import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { PricesController } from './prices.controller';

@Module({
  imports: [ProductsModule],
  controllers: [PricesController],
})
export class PricesModule {}
