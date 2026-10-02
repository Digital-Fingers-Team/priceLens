import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../seller/organizations.service';
import { ConnectorRegistry } from '../scraping/connectors/connector.registry';
import { listingKey, rankOf } from '../seller/seller-math';

/** Results read per search: the first page or two of a store's results. */
export const RANK_SCAN_DEPTH = 48;
export const MAX_KEYWORDS_PER_WORKSPACE = 50;
const PAUSE_MS = 2000;
const HISTORY_DAYS = 60;

/**
 * Where a seller's listing appears in a store's own search for a keyword,
 * checked once a day. The listing is found by the link the seller gave, or
 * by the store's id of any listing we matched to the same catalogue product.
 */
@Injectable()
export class RankTrackingService {
  private readonly logger = new Logger(RankTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  /** Platforms whose search we can read, for the keyword form. */
  async trackablePlatforms() {
    const platforms = await this.prisma.platform.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } });
    return platforms.filter((p) => this.connectors.isEnabled(p.slug)).map(({ id, name }) => ({ id, name }));
  }

  async list(userId: string, orgId: string, productId: string) {
    await this.organizations.requireMembership(userId, orgId);
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const keywords = await this.prisma.rankKeyword.findMany({
      where: { orgId, sellerProductId: productId },
      orderBy: { createdAt: 'asc' },
      include: {
        platform: { select: { id: true, name: true } },
        snapshots: { where: { checkedAt: { gte: since } }, orderBy: { checkedAt: 'asc' }, select: { position: true, scanned: true, checkedAt: true } },
      },
    });
    return keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      platform: k.platform,
      latest: k.snapshots.at(-1) ? { position: k.snapshots.at(-1)!.position, scanned: k.snapshots.at(-1)!.scanned, checkedAt: k.snapshots.at(-1)!.checkedAt.toISOString() } : null,
      history: k.snapshots.map((s) => ({ position: s.position, checkedAt: s.checkedAt.toISOString() })),
    }));
  }

  async add(userId: string, orgId: string, productId: string, input: { platformId: string; keyword: string }) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const product = await this.prisma.sellerProduct.findFirst({ where: { id: productId, orgId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found in this workspace');
    const platform = await this.prisma.platform.findUnique({ where: { id: input.platformId }, select: { slug: true } });
    if (!platform || !this.connectors.isEnabled(platform.slug)) throw new BadRequestException('We cannot read that store’s search');
    const keyword = input.keyword.trim().replace(/\s+/g, ' ').toLowerCase();
    if (keyword.length < 2) throw new BadRequestException('The keyword is too short');
    if ((await this.prisma.rankKeyword.count({ where: { orgId } })) >= MAX_KEYWORDS_PER_WORKSPACE) {
      throw new BadRequestException(`A workspace can track up to ${MAX_KEYWORDS_PER_WORKSPACE} keywords`);
    }
    const row = await this.prisma.rankKeyword.upsert({
      where: { sellerProductId_platformId_keyword: { sellerProductId: product.id, platformId: input.platformId, keyword } },
      create: { orgId, sellerProductId: product.id, platformId: input.platformId, keyword },
      update: {},
    });
    return { id: row.id, keyword: row.keyword };
  }

  async remove(userId: string, orgId: string, keywordId: string) {
    await this.organizations.requireMembership(userId, orgId, OrgRole.ADMIN);
    const { count } = await this.prisma.rankKeyword.deleteMany({ where: { id: keywordId, orgId } });
    if (count === 0) throw new NotFoundException('Keyword not found');
  }

  /**
   * The daily check. One search per distinct (store, keyword), shared by
   * every seller tracking it; a pause between searches; a failed search
   * records nothing rather than a false "not found".
   */
  async runAll(pauseMs = PAUSE_MS): Promise<{ searches: number; snapshots: number }> {
    const keywords = await this.prisma.rankKeyword.findMany({
      include: {
        platform: { select: { id: true, slug: true } },
        sellerProduct: { select: { listingUrl: true, canonicalProductId: true, isActive: true } },
      },
    });
    const groups = new Map<string, typeof keywords>();
    for (const k of keywords) {
      if (!k.sellerProduct.isActive || !this.connectors.isEnabled(k.platform.slug)) continue;
      const key = `${k.platform.slug}\u0000${k.keyword}`;
      groups.set(key, [...(groups.get(key) ?? []), k]);
    }

    let searches = 0;
    let snapshots = 0;
    for (const group of groups.values()) {
      const { platform, keyword } = group[0];
      let results: Array<{ externalId: string; externalUrl: string }>;
      try {
        results = await this.connectors.get(platform.slug)!.searchListings(keyword, RANK_SCAN_DEPTH);
        searches++;
      } catch (error) {
        this.logger.warn(`Rank search failed on ${platform.slug} for "${keyword}": ${(error as Error).message}`);
        continue;
      }
      if (results.length === 0) continue; // an empty page is more likely a block than a real "nobody sells this"

      for (const k of group) {
        const ids = k.sellerProduct.canonicalProductId
          ? (
              await this.prisma.sourceListing.findMany({
                where: { platformId: platform.id, canonicalProductId: k.sellerProduct.canonicalProductId },
                select: { externalId: true },
              })
            ).map((l) => l.externalId)
          : [];
        // The seller's own link decides when it is on this store; otherwise
        // the best-placed listing of the same catalogue product.
        const host = (url: string | null) => (url ? (listingKey(url)?.split('/')[0] ?? null) : null);
        const ownHere = k.sellerProduct.listingUrl !== null && host(k.sellerProduct.listingUrl) === host(results[0].externalUrl);
        const found = ownHere
          ? [rankOf(results, { url: k.sellerProduct.listingUrl, externalId: null })]
          : ids.map((externalId) => rankOf(results, { url: null, externalId }));
        const hits = found.filter((p): p is number => p !== null);
        const position = hits.length ? Math.min(...hits) : null;
        await this.prisma.rankSnapshot.create({ data: { keywordId: k.id, position, scanned: results.length } });
        snapshots++;
      }
      if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    this.logger.log(`Rank tracking: ${searches} searches, ${snapshots} positions recorded`);
    return { searches, snapshots };
  }
}
