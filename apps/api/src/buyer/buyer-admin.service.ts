import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SaveInstallmentPlanDto, SavePromoDto, SaveWarrantyRuleDto } from './dto/buyer.dto';

const decimal = (value: number | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Prisma.Decimal(value);

/** Admin-entered data for the buyer tools. Nothing here is invented: the owner types in published terms. */
@Injectable()
export class BuyerAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Installment plans ────────────────────────────────────────────────

  listInstallments() {
    return this.prisma.installmentPlan.findMany({ orderBy: [{ provider: 'asc' }, { months: 'asc' }] });
  }

  saveInstallment(dto: SaveInstallmentPlanDto, id?: string) {
    const data = {
      provider: dto.provider,
      kind: dto.kind,
      months: dto.months,
      markupPct: dto.markupPct,
      adminFeePct: dto.adminFeePct,
      adminFeeFlat: dto.adminFeeFlat === undefined ? undefined : new Prisma.Decimal(dto.adminFeeFlat),
      downPaymentPct: dto.downPaymentPct,
      minAmount: decimal(dto.minAmount),
      maxAmount: decimal(dto.maxAmount),
      platformIds: dto.platformIds,
      validUntil: dto.validUntil === undefined ? undefined : dto.validUntil ? new Date(dto.validUntil) : null,
      sourceUrl: dto.sourceUrl,
      notes: dto.notes,
      isActive: dto.isActive,
    };
    if (id) return this.prisma.installmentPlan.update({ where: { id }, data });
    if (!dto.provider || !dto.months) throw new BadRequestException('provider and months are required');
    return this.prisma.installmentPlan.create({ data: { ...data, provider: dto.provider, months: dto.months } });
  }

  async deleteInstallment(id: string) {
    const { count } = await this.prisma.installmentPlan.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Plan not found');
  }

  // ─── Promos ───────────────────────────────────────────────────────────

  listPromos() {
    return this.prisma.promo.findMany({ include: { platform: { select: { name: true } } }, orderBy: [{ type: 'asc' }, { createdAt: 'desc' }] });
  }

  savePromo(dto: SavePromoDto, id?: string) {
    if (dto.type === 'COUPON' && !id && !dto.code) throw new BadRequestException('A coupon needs a code');
    if (dto.type === 'CARD' && !id && !dto.bankName) throw new BadRequestException('A card offer needs a bank');
    const data = {
      type: dto.type,
      platformId: dto.platformId,
      bankName: dto.bankName,
      code: dto.code?.trim().toUpperCase(),
      title: dto.title,
      titleAr: dto.titleAr,
      valueType: dto.valueType,
      value: dto.value,
      maxDiscount: decimal(dto.maxDiscount),
      minSpend: decimal(dto.minSpend),
      validFrom: dto.validFrom === undefined ? undefined : dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil === undefined ? undefined : dto.validUntil ? new Date(dto.validUntil) : null,
      sourceUrl: dto.sourceUrl,
      isActive: dto.isActive,
      // "Verified" means the admin just checked it: stamp the time with it.
      ...(dto.verified !== undefined ? { verified: dto.verified, lastVerifiedAt: dto.verified ? new Date() : null } : {}),
    };
    if (id) return this.prisma.promo.update({ where: { id }, data });
    if (!dto.type || !dto.title || !dto.valueType || dto.value === undefined) {
      throw new BadRequestException('type, title, valueType and value are required');
    }
    return this.prisma.promo.create({ data: { ...data, type: dto.type, title: dto.title, valueType: dto.valueType, value: dto.value } });
  }

  async deletePromo(id: string) {
    const { count } = await this.prisma.promo.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Promo not found');
  }

  // ─── Warranty rules ───────────────────────────────────────────────────

  listWarranty() {
    return this.prisma.warrantyRule.findMany({ include: { platform: { select: { name: true } } }, orderBy: [{ platformId: 'asc' }, { brand: 'asc' }] });
  }

  /** One rule per (store, brand); a null brand is the store's default. */
  async saveWarranty(dto: SaveWarrantyRuleDto) {
    const brand = dto.brand?.trim().toLowerCase() || null;
    const data = { type: dto.type, months: dto.months ?? 0, agentName: dto.agentName ?? null, notes: dto.notes ?? null };
    const existing = await this.prisma.warrantyRule.findFirst({ where: { platformId: dto.platformId, brand } });
    if (existing) return this.prisma.warrantyRule.update({ where: { id: existing.id }, data });
    return this.prisma.warrantyRule.create({ data: { platformId: dto.platformId, brand, ...data } });
  }

  async deleteWarranty(id: string) {
    const { count } = await this.prisma.warrantyRule.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Rule not found');
  }
}
