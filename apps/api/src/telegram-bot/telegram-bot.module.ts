import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { BuyerModule } from '../buyer/buyer.module';
import { ImageSearchModule } from '../image-search/image-search.module';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [SearchModule, BuyerModule, ImageSearchModule],
  controllers: [TelegramBotController],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
