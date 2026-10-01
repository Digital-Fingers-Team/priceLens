import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators';
import { BuyerAdminService } from './buyer-admin.service';
import { SaveInstallmentPlanDto, SavePromoDto, SaveWarrantyRuleDto } from './dto/buyer.dto';

/** /admin: installment plans, card offers and coupons, warranty rules. */
@ApiTags('admin')
@Controller('admin')
@Roles(UserRole.ADMIN)
export class BuyerAdminController {
  constructor(private readonly admin: BuyerAdminService) {}

  @Get('installment-plans')
  installments() {
    return this.admin.listInstallments();
  }

  @Post('installment-plans')
  createInstallment(@Body() dto: SaveInstallmentPlanDto) {
    return this.admin.saveInstallment(dto);
  }

  @Patch('installment-plans/:id')
  updateInstallment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveInstallmentPlanDto) {
    return this.admin.saveInstallment(dto, id);
  }

  @Delete('installment-plans/:id')
  async deleteInstallment(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deleteInstallment(id);
    return { ok: true };
  }

  @Get('promos')
  promos() {
    return this.admin.listPromos();
  }

  @Post('promos')
  createPromo(@Body() dto: SavePromoDto) {
    return this.admin.savePromo(dto);
  }

  @Patch('promos/:id')
  updatePromo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SavePromoDto) {
    return this.admin.savePromo(dto, id);
  }

  @Delete('promos/:id')
  async deletePromo(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deletePromo(id);
    return { ok: true };
  }

  @Get('warranty-rules')
  warranty() {
    return this.admin.listWarranty();
  }

  @Put('warranty-rules')
  saveWarranty(@Body() dto: SaveWarrantyRuleDto) {
    return this.admin.saveWarranty(dto);
  }

  @Delete('warranty-rules/:id')
  async deleteWarranty(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deleteWarranty(id);
    return { ok: true };
  }
}
