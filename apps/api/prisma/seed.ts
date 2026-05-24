// apps/api/prisma/seed.ts
import { PrismaClient, ConnectorType, MatchStatus, ProductTier, UserRole } from '@prisma/client';
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

  const amazon = await prisma.platform.upsert({
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

  const newegg = await prisma.platform.upsert({
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

  const bestbuy = await prisma.platform.upsert({
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

  const bhphotovideo = await prisma.platform.upsert({
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

  const walmart = await prisma.platform.upsert({
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

  const rtx4090 = await prisma.canonicalProduct.upsert({
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

  const macbookPro = await prisma.canonicalProduct.upsert({
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

  const galaxyS24 = await prisma.canonicalProduct.upsert({
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

  // â”€â”€â”€ Sample Listings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  await prisma.sourceListing.upsert({
    where: {
      platformId_externalId: {
        platformId: amazon.id,
        externalId: 'rtx4090-amazon',
      },
    },
    update: {},
    create: {
      platformId: amazon.id,
      canonicalProductId: rtx4090.id,
      externalId: 'rtx4090-amazon',
      externalUrl: 'https://www.amazon.com/dp/B0B123RTX4090',
      rawTitle: 'NVIDIA GeForce RTX 4090 Founders Edition',
      rawPrice: 1799.99,
      rawCurrency: 'USD',
      rawBrand: 'NVIDIA',
      rawImageUrl: null,
      rawAttributes: { vram: '24GB' },
      rawCategory: 'Graphics Cards',
      normalizedTitle: 'nvidia geforce rtx 4090 founders edition',
      extractedBrand: 'NVIDIA',
      extractedModel: 'RTX 4090 FE',
      extractedAttributes: { vram: '24GB' },
      priceUsd: 1799.99,
      inStock: true,
      rating: 4.8,
      reviewCount: 1248,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: 0.98,
      matchedAt: new Date(),
    },
  });

  await prisma.sourceListing.upsert({
    where: {
      platformId_externalId: {
        platformId: newegg.id,
        externalId: 'rtx4090-newegg',
      },
    },
    update: {},
    create: {
      platformId: newegg.id,
      canonicalProductId: rtx4090.id,
      externalId: 'rtx4090-newegg',
      externalUrl: 'https://www.newegg.com/p/N82E16814932580',
      rawTitle: 'NVIDIA GeForce RTX 4090 Founders Edition',
      rawPrice: 1749.99,
      rawCurrency: 'USD',
      rawBrand: 'NVIDIA',
      rawImageUrl: null,
      rawAttributes: { vram: '24GB' },
      rawCategory: 'Graphics Cards',
      normalizedTitle: 'nvidia geforce rtx 4090 founders edition',
      extractedBrand: 'NVIDIA',
      extractedModel: 'RTX 4090 FE',
      extractedAttributes: { vram: '24GB' },
      priceUsd: 1749.99,
      inStock: true,
      rating: 4.7,
      reviewCount: 842,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: 0.97,
      matchedAt: new Date(),
    },
  });

  await prisma.sourceListing.upsert({
    where: {
      platformId_externalId: {
        platformId: bestbuy.id,
        externalId: 'macbookpro14-bestbuy',
      },
    },
    update: {},
    create: {
      platformId: bestbuy.id,
      canonicalProductId: macbookPro.id,
      externalId: 'macbookpro14-bestbuy',
      externalUrl: 'https://www.bestbuy.com/site/apple-macbook-pro-14',
      rawTitle: 'Apple MacBook Pro 14-inch M3 Pro 512GB',
      rawPrice: 2399.99,
      rawCurrency: 'USD',
      rawBrand: 'Apple',
      rawImageUrl: null,
      rawAttributes: { storage: '512GB SSD' },
      rawCategory: 'Laptops',
      normalizedTitle: 'apple macbook pro 14 m3 pro 512gb',
      extractedBrand: 'Apple',
      extractedModel: 'MacBook Pro 14 M3 Pro',
      extractedAttributes: { storage: '512GB SSD' },
      priceUsd: 2399.99,
      inStock: true,
      rating: 4.9,
      reviewCount: 406,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: 0.99,
      matchedAt: new Date(),
    },
  });

  await prisma.sourceListing.upsert({
    where: {
      platformId_externalId: {
        platformId: bhphotovideo.id,
        externalId: 'galaxys24-bh',
      },
    },
    update: {},
    create: {
      platformId: bhphotovideo.id,
      canonicalProductId: galaxyS24.id,
      externalId: 'galaxys24-bh',
      externalUrl: 'https://www.bhphotovideo.com/c/product/1800000-REG/samsung_galaxy_s24_ultra.html',
      rawTitle: 'Samsung Galaxy S24 Ultra 256GB',
      rawPrice: 1199.99,
      rawCurrency: 'USD',
      rawBrand: 'Samsung',
      rawImageUrl: null,
      rawAttributes: { storage: '256GB' },
      rawCategory: 'Smartphones',
      normalizedTitle: 'samsung galaxy s24 ultra 256gb',
      extractedBrand: 'Samsung',
      extractedModel: 'Galaxy S24 Ultra',
      extractedAttributes: { storage: '256GB' },
      priceUsd: 1199.99,
      inStock: true,
      rating: 4.8,
      reviewCount: 932,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: 0.98,
      matchedAt: new Date(),
    },
  });

  await prisma.sourceListing.upsert({
    where: {
      platformId_externalId: {
        platformId: walmart.id,
        externalId: 'galaxys24-walmart',
      },
    },
    update: {},
    create: {
      platformId: walmart.id,
      canonicalProductId: galaxyS24.id,
      externalId: 'galaxys24-walmart',
      externalUrl: 'https://www.walmart.com/ip/Samsung-Galaxy-S24-Ultra',
      rawTitle: 'Samsung Galaxy S24 Ultra 256GB',
      rawPrice: 1149.99,
      rawCurrency: 'USD',
      rawBrand: 'Samsung',
      rawImageUrl: null,
      rawAttributes: { storage: '256GB' },
      rawCategory: 'Smartphones',
      normalizedTitle: 'samsung galaxy s24 ultra 256gb',
      extractedBrand: 'Samsung',
      extractedModel: 'Galaxy S24 Ultra',
      extractedAttributes: { storage: '256GB' },
      priceUsd: 1149.99,
      inStock: true,
      rating: 4.6,
      reviewCount: 518,
      matchStatus: MatchStatus.ACCEPTED,
      matchConfidence: 0.97,
      matchedAt: new Date(),
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
