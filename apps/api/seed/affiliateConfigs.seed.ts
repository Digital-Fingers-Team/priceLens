import { PrismaClient } from '@prisma/client';

/**
 * Example affiliate configs for the three stores with a live provider
 * (see src/affiliate/providers/). Platform slugs match the ones already
 * used by the scraping connectors (amazon.connector.ts etc). Safe to
 * re-run: upserts by platformId. Placeholder affiliate IDs -- replace via
 * the PUT /affiliate/configs/:platformId admin endpoint once real
 * partner-program IDs are issued.
 */
export const EXAMPLE_AFFILIATE_CONFIGS = [
  {
    platformSlug: 'amazon',
    providerKey: 'amazon',
    affiliateId: 'pricelens-21',
    trackingParams: {},
  },
  {
    platformSlug: 'jumia',
    providerKey: 'jumia',
    affiliateId: 'pricelens-jm',
    trackingParams: { campaign: 'pricelens-cpa' },
  },
  {
    platformSlug: 'noon',
    providerKey: 'noon',
    affiliateId: 'pricelens-noon',
    trackingParams: {},
  },
];

export async function seedAffiliateConfigs(prisma: PrismaClient): Promise<number> {
  let seeded = 0;

  for (const example of EXAMPLE_AFFILIATE_CONFIGS) {
    const platform = await prisma.platform.findUnique({ where: { slug: example.platformSlug } });
    if (!platform) {
      console.warn(`[seed-affiliate-configs] Platform "${example.platformSlug}" not found, skipping`);
      continue;
    }

    await prisma.affiliateConfig.upsert({
      where: { platformId: platform.id },
      create: {
        platformId: platform.id,
        providerKey: example.providerKey,
        affiliateId: example.affiliateId,
        trackingParams: example.trackingParams,
      },
      update: {
        providerKey: example.providerKey,
        affiliateId: example.affiliateId,
        trackingParams: example.trackingParams,
      },
    });
    seeded += 1;
  }

  return seeded;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAffiliateConfigs(prisma)
    .then((count) => {
      console.log(`[seed-affiliate-configs] Upserted ${count} affiliate config(s)`);
    })
    .catch((error) => {
      console.error('[seed-affiliate-configs] Failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
