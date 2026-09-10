import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { loadSeedConfig } from './config';
import { buildProductSeeds, insertProducts, upsertCategories } from './generators/generateProducts';
import { generateListings } from './generators/generateListings';
import { PriceHistoryWriter } from './generators/generatePriceHistory';
import { generateStores } from './generators/generateStores';
import type { GenerationStats, SeedConfig } from './types';
import { withPgClient } from './utils/batchInsert';

export async function runSeed(): Promise<void> {
  const config = loadSeedConfig();
  const prisma = new PrismaClient();

  try {
    console.log(`[seed] Starting PriceLens seed profile=${config.profile}`);
    if (config.reset) await resetSeedData(prisma);
    await seedUsers(prisma);

    const run = await startSeedRun(prisma, config);
    const categoryIds = await upsertCategories(prisma);
    const stores = await generateStores(prisma);

    const stats: GenerationStats = {
      products: 0,
      listings: 0,
      challengeListings: 0,
      priceHistory: 0,
    };

    if (config.generateProducts) {
      const products = buildProductSeeds(config, categoryIds);

      await withPgClient(config, async (client) => {
        stats.products = await insertProducts(prisma, client, config, run.id, products);
        const historyWriter = new PriceHistoryWriter(prisma, client, config, run.id, products);
        const listingStats = await generateListings(
          prisma,
          client,
          config,
          run.id,
          products,
          stores,
          (listings) => historyWriter.addListings(listings),
        );
        await historyWriter.flush();
        stats.listings = listingStats.listings;
        stats.challengeListings = listingStats.challenges;
        stats.priceHistory = historyWriter.count();
      });
    } else {
      console.log('[seed] SEED_GENERATE_PRODUCTS is not "true" — skipping synthetic product/listing/price-history generation. Real catalog data comes from live ingestion; set SEED_GENERATE_PRODUCTS=true to opt back into the demo dataset.');
    }

    await prisma.seedRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        counts: { ...stats },
      },
    });

    console.log('[seed] Complete:', {
      profile: config.profile,
      generateProducts: config.generateProducts,
      inserted: stats,
    });
  } catch (error) {
    await markFailed(prisma, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function startSeedRun(prisma: PrismaClient, config: SeedConfig) {
  if (config.resume) {
    const active = await prisma.seedRun.findFirst({
      where: {
        profile: config.profile,
        seedVersion: config.seedVersion,
        status: 'running',
      },
      orderBy: { startedAt: 'desc' },
    });
    if (active) {
      console.log(`[seed] Resuming seed run ${active.id}`);
      return active;
    }
  }

  return prisma.seedRun.create({
    data: {
      profile: config.profile,
      seedVersion: config.seedVersion,
      status: 'running',
      config: {
        productTarget: config.productTarget,
        listingsPerProduct: config.listingsPerProduct,
        challengeListingTarget: config.challengeListingTarget,
        historyRowsPerListing: config.historyRowsPerListing,
        batchSize: config.batchSize,
        now: config.now.toISOString(),
      },
    },
  });
}

async function markFailed(prisma: PrismaClient, error: unknown): Promise<void> {
  const active = await prisma.seedRun.findFirst({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
  });
  if (!active) return;
  await prisma.seedRun.update({
    where: { id: active.id },
    data: {
      status: 'failed',
      completedAt: new Date(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    },
  });
}

async function resetSeedData(prisma: PrismaClient): Promise<void> {
  console.log('[seed] Resetting generated marketplace data');
  await prisma.$transaction([
    prisma.reviewDecision.deleteMany(),
    prisma.reviewQueue.deleteMany(),
    prisma.matchDecision.deleteMany(),
    prisma.priceHistory.deleteMany(),
    prisma.priceAlert.deleteMany(),
    prisma.watchlistItem.deleteMany(),
    prisma.sourceListing.deleteMany(),
    prisma.canonicalProduct.deleteMany(),
    prisma.seedCheckpoint.deleteMany(),
    prisma.seedRun.deleteMany(),
  ]);
}

async function seedUsers(prisma: PrismaClient): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';

  // Weak, publicly-documented defaults are fine for local development but must
  // never reach a real deployment, so in production the passwords have to be
  // supplied explicitly and the staff accounts are skipped otherwise.
  const staff = [
    {
      envVar: 'SEED_ADMIN_PASSWORD',
      devPassword: 'admin_dev_password_change_me',
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@pricelens.dev',
      username: 'admin',
      displayName: 'PriceLens Admin',
      role: UserRole.ADMIN,
    },
    {
      envVar: 'SEED_MODERATOR_PASSWORD',
      devPassword: 'moderator_dev_password',
      email: process.env.SEED_MODERATOR_EMAIL ?? 'mod@pricelens.dev',
      username: 'moderator',
      displayName: 'PriceLens Moderator',
      role: UserRole.MODERATOR,
    },
  ];

  for (const account of staff) {
    const supplied = process.env[account.envVar];

    if (isProduction && !supplied) {
      console.warn(
        `[seed] ${account.envVar} is not set — skipping the ${account.role} account. ` +
          'Set it to provision staff access in production.',
      );
      continue;
    }

    const password = supplied ?? account.devPassword;

    if (isProduction && password.length < 12) {
      throw new Error(`[seed] ${account.envVar} must be at least 12 characters in production.`);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.upsert({
      where: { email: account.email },
      // Never silently reset the password of an account that already exists.
      update: {
        role: account.role,
        emailVerified: true,
        displayName: account.displayName,
      },
      create: {
        email: account.email,
        username: account.username,
        passwordHash,
        role: account.role,
        emailVerified: true,
        displayName: account.displayName,
      },
    });

    console.log(`[seed] Ensured ${account.role} account ${account.email}`);
  }
}
