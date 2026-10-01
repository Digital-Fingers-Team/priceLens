import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { LandedCostService } from './landed-cost.service';
import { SaveLandedCostRuleDto } from './dto/landed-cost.dto';

/** /admin/landed-cost: customs, VAT and shipping per cross-border store. */
@ApiTags('admin')
@Controller('admin/landed-cost-rules')
@Roles(UserRole.ADMIN)
export class LandedCostAdminController {
  constructor(private readonly landedCost: LandedCostService) {}

  @Get()
  list() {
    return this.landedCost.adminList();
  }

  @Put()
  save(@CurrentUser() actor: User, @Body() dto: SaveLandedCostRuleDto) {
    return this.landedCost.adminSave(dto, actor.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.landedCost.adminDelete(id);
    return { ok: true };
  }
}
