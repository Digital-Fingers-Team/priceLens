import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import { FEATURES } from '../billing/plan-limits';
import { RequiresFeature } from '../billing/requires-feature.decorator';
import { CreateQuoteDto, UpdateQuoteItemDto } from './dto/procurement.dto';
import { ProcurementService } from './procurement.service';

const BASE = 'procurement/workspaces/:orgId/quotes';

@ApiTags('procurement')
@Controller()
@RequiresFeature(FEATURES.PROCUREMENT_QUOTES)
export class ProcurementController {
  constructor(private readonly quotes: ProcurementService) {}

  @Get(BASE)
  list(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.quotes.list(user.id, orgId);
  }

  @Post(BASE)
  create(@CurrentUser() user: User, @Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: CreateQuoteDto) {
    return this.quotes.create(user.id, orgId, dto);
  }

  @Get(`${BASE}/:quoteId`)
  get(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ) {
    return this.quotes.get(user.id, orgId, quoteId);
  }

  @Post(`${BASE}/:quoteId/reprice`)
  reprice(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ) {
    return this.quotes.reprice(user.id, orgId, quoteId);
  }

  @Post(`${BASE}/:quoteId/finalize`)
  finalize(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ) {
    return this.quotes.finalize(user.id, orgId, quoteId);
  }

  @Patch(`${BASE}/:quoteId/items/:itemId`)
  updateItem(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateQuoteItemDto,
  ) {
    return this.quotes.updateItem(user.id, orgId, quoteId, itemId, dto);
  }

  @Delete(`${BASE}/:quoteId`)
  remove(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ) {
    return this.quotes.remove(user.id, orgId, quoteId);
  }

  @Get(`${BASE}/:quoteId/csv`)
  async csv(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Res() res: Response,
  ) {
    const body = await this.quotes.exportCsv(user.id, orgId, quoteId);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="quotation.csv"' });
    res.send(body);
  }

  @Get(`${BASE}/:quoteId/pdf`)
  async pdf(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Res() res: Response,
  ) {
    const body = await this.quotes.exportPdf(user.id, orgId, quoteId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="quotation.pdf"' });
    res.send(body);
  }
}
