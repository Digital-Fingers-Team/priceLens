// apps/api/prisma/seed.ts
import { PrismaClient, ConnectorType, ProductTier, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Categories ─────────────────────────────────────────────────────────

  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      slug: 'electronics',
      name: 'Electronics',
      level: 0,
      searchTerms: ['electronics', 'tech', 'gadgets'],
    },
  });

  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: {
      slug: 'laptops',
      name: 'Laptops',
      parentId: electronics.id,
      level: 1,
      searchTerms: ['laptop', 'notebook', 'ultrabook', 'chromebook'],
    },
  });

  const gpus = await prisma.category.upsert({
    where: { slug: 'graphics-cards' },
    update: {},
    create: {
      slug: 'graphics-cards',
      name: 'Graphics Cards',
      parentId: electronics.id,
      level: 1,
      searchTerms: ['gpu', 'graphics card', 'video card', 'gfx card'],
    },
  });

  const smartphones = await prisma.category.upsert({
    where: { slug: 'smartphones' },
    update: {},
    create: {
      slug: 'smartphones',
      name: 'Smartphones',
      parentId: electronics.id,
      level: 1,
      searchTerms: ['phone', 'smartphone', 'mobile', 'cell phone'],
    },
  });

  // ─── Platforms ──────────────────────────────────────────────────────────

  await prisma.platform.upsert({
    where: { slug: 'amazon' },
    update: {},
    create: {
      slug: 'amazon',
      name: 'Amazon',
      baseUrl: 'https://www.amazon.com',
      connectorType: ConnectorType.PLAYWRIGHT,
      rateLimit: 30,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'newegg' },
    update: {},
    create: {
      slug: 'newegg',
      name: 'Newegg',
      baseUrl: 'https://www.newegg.com',
      connectorType: ConnectorType.PLAYWRIGHT,
      rateLimit: 60,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'bestbuy' },
    update: {},
    create: {
      slug: 'bestbuy',
      name: 'Best Buy',
      baseUrl: 'https://www.bestbuy.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'bhphotovideo' },
    update: {},
    create: {
      slug: 'bhphotovideo',
      name: 'B&H Photo Video',
      baseUrl: 'https://www.bhphotovideo.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 30,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'walmart' },
    update: {},
    create: {
      slug: 'walmart',
      name: 'Walmart',
      baseUrl: 'https://www.walmart.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

  // ─── Canonical Products ──────────────────────────────────────────────────

  await prisma.canonicalProduct.upsert({
    where: { slug: 'nvidia-rtx-4090-founders-edition' },
    update: {},
    create: {
      slug: 'nvidia-rtx-4090-founders-edition',
      categoryId: gpus.id,
      title: 'NVIDIA GeForce RTX 4090 Founders Edition',
      normalizedTitle: 'nvidia geforce rtx 4090 founders edition',
      brand: 'NVIDIA',
      model: 'RTX 4090 FE',
      attributes: {
        vram: '24GB',
        vramType: 'GDDR6X',
        tdp: '450W',
        architecture: 'Ada Lovelace',
        interface: 'PCIe 4.0 x16',
      },
      tier: ProductTier.ULTRA_PREMIUM,
      isVerified: true,
    },
  });

  await prisma.canonicalProduct.upsert({
    where: { slug: 'apple-macbook-pro-14-m3-pro' },
    update: {},
    create: {
      slug: 'apple-macbook-pro-14-m3-pro',
      categoryId: laptops.id,
      title: 'Apple MacBook Pro 14" M3 Pro',
      normalizedTitle: 'apple macbook pro 14 m3 pro',
      brand: 'Apple',
      model: 'MacBook Pro 14" M3 Pro',
      attributes: {
        chip: 'Apple M3 Pro',
        ram: '18GB',
        storage: '512GB SSD',
        display: '14.2-inch Liquid Retina XDR',
        color: 'Space Black',
      },
      tier: ProductTier.ULTRA_PREMIUM,
      isVerified: true,
    },
  });

  await prisma.canonicalProduct.upsert({
    where: { slug: 'samsung-galaxy-s24-ultra-256gb' },
    update: {},
    create: {
      slug: 'samsung-galaxy-s24-ultra-256gb',
      categoryId: smartphones.id,
      title: 'Samsung Galaxy S24 Ultra 256GB',
      normalizedTitle: 'samsung galaxy s24 ultra 256gb',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      ean: '8806095256504',
      attributes: {
        storage: '256GB',
        ram: '12GB',
        color: 'Titanium Black',
        display: '6.8-inch Dynamic AMOLED 2X',
        os: 'Android 14',
      },
      tier: ProductTier.ULTRA_PREMIUM,
      isVerified: true,
    },
  });

  // ─── Admin User ──────────────────────────────────────────────────────────

  const adminHash = await bcrypt.hash('admin_dev_password_change_me', 12);
  await prisma.user.upsert({
    where: { email: 'admin@pricelens.dev' },
    update: {},
    create: {
      email: 'admin@pricelens.dev',
      username: 'admin',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      emailVerified: true,
      displayName: 'PriceLens Admin',
    },
  });

  const modHash = await bcrypt.hash('moderator_dev_password', 12);
  await prisma.user.upsert({
    where: { email: 'mod@pricelens.dev' },
    update: {},
    create: {
      email: 'mod@pricelens.dev',
      username: 'moderator',
      passwordHash: modHash,
      role: UserRole.MODERATOR,
      emailVerified: true,
      displayName: 'PriceLens Moderator',
    },
  });

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });