import { Injectable, NotFoundException } from '@nestjs/common';
import { PromoType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** The buyer's own settings for the buyer tools. */
@Injectable()
export class BuyerUserService {
  constructor(private readonly prisma: PrismaService) {}

  async banks(userId: string): Promise<string[]> {
    const rows = await this.prisma.userBank.findMany({ where: { userId }, orderBy: { bankName: 'asc' } });
    return rows.map((row) => row.bankName);
  }

  /** Replaces the list. Bank names only: there is no field a card number could go in. */
  async setBanks(userId: string, banks: string[]): Promise<string[]> {
    const clean = [...new Set(banks.map((b) => b.trim()).filter(Boolean))].slice(0, 20);
    await this.prisma.$transaction([
      this.prisma.userBank.deleteMany({ where: { userId } }),
      this.prisma.userBank.createMany({ data: clean.map((bankName) => ({ userId, bankName })) }),
    ]);
    return this.banks(userId);
  }

  /** Every bank named on an offer, for the picker. */
  async knownBanks(): Promise<string[]> {
    const rows = await this.prisma.promo.findMany({
      where: { bankName: { not: null }, isActive: true },
      distinct: ['bankName'],
      select: { bankName: true },
      orderBy: { bankName: 'asc' },
    });
    return rows.map((row) => row.bankName!).filter(Boolean);
  }

  /**
   * "This code worked / didn't." One vote per buyer per code; changing a
   * vote moves the counters, so the totals always equal the votes.
   */
  async reportCoupon(userId: string, promoId: string, worked: boolean) {
    const promo = await this.prisma.promo.findFirst({ where: { id: promoId, type: PromoType.COUPON } });
    if (!promo) throw new NotFoundException('Coupon not found');

    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.promoReport.findUnique({ where: { promoId_userId: { promoId, userId } } });
      if (previous?.worked === worked) return { worked };
      await tx.promoReport.upsert({
        where: { promoId_userId: { promoId, userId } },
        create: { promoId, userId, worked },
        update: { worked, createdAt: new Date() },
      });
      await tx.promo.update({
        where: { id: promoId },
        data: {
          workedCount: { increment: (worked ? 1 : 0) - (previous?.worked === true ? 1 : 0) },
          failedCount: { increment: (worked ? 0 : 1) - (previous?.worked === false ? 1 : 0) },
        },
      });
      return { worked };
    });
  }
}
