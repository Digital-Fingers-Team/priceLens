import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AlertType, User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { WatchlistService } from './watchlist.service';

interface AddWatchlistBody {
  productId: string;
  note?: string;
}

interface CreateAlertBody {
  alertType: AlertType;
  thresholdValue: number;
}

@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  getWatchlist(@CurrentUser() user: User) {
    return this.watchlistService.getWatchlist(user.id);
  }

  @Post()
  addToWatchlist(@CurrentUser() user: User, @Body() body: AddWatchlistBody) {
    return this.watchlistService.addToWatchlist(user.id, body.productId, body.note);
  }

  @Delete(':productId')
  removeFromWatchlist(
    @CurrentUser() user: User,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.watchlistService.removeFromWatchlist(user.id, productId);
  }

  @Get('alerts')
  getAlerts(@CurrentUser() user: User) {
    return this.watchlistService.getAlerts(user.id);
  }

  @Post(':productId/alerts')
  createAlert(
    @CurrentUser() user: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: CreateAlertBody,
  ) {
    return this.watchlistService.createAlert(
      user.id,
      productId,
      body.alertType,
      Number(body.thresholdValue),
    );
  }

  @Delete('alerts/:alertId')
  deleteAlert(
    @CurrentUser() user: User,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.watchlistService.deleteAlert(user.id, alertId);
  }
}
