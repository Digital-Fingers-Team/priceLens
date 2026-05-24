import { PrismaClient, ConnectorType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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

  await prisma.category.upsert({
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

  await prisma.category.upsert({
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

  await prisma.category.upsert({
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

  await prisma.platform.upsert({
    where: { slug: 'amazon' },
    update: {
      name: 'Amazon',
      baseUrl: 'https://www.amazon.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 30,
    },
    create: {
      slug: 'amazon',
      name: 'Amazon',
      baseUrl: 'https://www.amazon.com',
      connectorType: ConnectorType.HTTP_API,
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
    update: {
      name: 'Best Buy',
      baseUrl: 'https://www.bestbuy.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
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

  await prisma.platform.upsert({
    where: { slug: 'alibaba' },
    update: {
      name: 'Alibaba',
      baseUrl: 'https://www.alibaba.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
    create: {
      slug: 'alibaba',
      name: 'Alibaba',
      baseUrl: 'https://www.alibaba.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'noon' },
    update: {
      name: 'Noon',
      baseUrl: 'https://www.noon.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
    create: {
      slug: 'noon',
      name: 'Noon',
      baseUrl: 'https://www.noon.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'jumia' },
    update: {
      name: 'Jumia',
      baseUrl: 'https://www.jumia.com.eg',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
    create: {
      slug: 'jumia',
      name: 'Jumia',
      baseUrl: 'https://www.jumia.com.eg',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

  await prisma.platform.upsert({
    where: { slug: 'carrefour' },
    update: {
      name: 'Carrefour',
      baseUrl: 'https://www.carrefouruae.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
    create: {
      slug: 'carrefour',
      name: 'Carrefour',
      baseUrl: 'https://www.carrefouruae.com',
      connectorType: ConnectorType.HTTP_API,
      rateLimit: 60,
    },
  });

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

  const smartphones = await prisma.category.findUnique({ where: { slug: 'smartphones' } });
  const amazon = await prisma.platform.findUnique({ where: { slug: 'amazon' } });
  const bestBuy = await prisma.platform.findUnique({ where: { slug: 'bestbuy' } });

  if (smartphones && amazon && bestBuy) {
    const iphone15 = await prisma.canonicalProduct.upsert({
      where: { slug: 'apple-iphone-15-128gb' },
      update: {
        title: 'Apple iPhone 15 128GB',
        normalizedTitle: 'apple iphone 15 128gb',
        brand: 'Apple',
        model: 'iPhone 15',
        categoryId: smartphones.id,
        tier: 'PREMIUM',
        imageUrl: 'https://store.storeimages.cdn-apple.com/iphone-15-blue.jpg',
      },
      create: {
        slug: 'apple-iphone-15-128gb',
        title: 'Apple iPhone 15 128GB',
        normalizedTitle: 'apple iphone 15 128gb',
        brand: 'Apple',
        model: 'iPhone 15',
        categoryId: smartphones.id,
        tier: 'PREMIUM',
        imageUrl: 'https://store.storeimages.cdn-apple.com/iphone-15-blue.jpg',
      },
    });

    const iphone15Pro = await prisma.canonicalProduct.upsert({
      where: { slug: 'apple-iphone-15-pro-256gb' },
      update: {
        title: 'Apple iPhone 15 Pro 256GB',
        normalizedTitle: 'apple iphone 15 pro 256gb',
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        categoryId: smartphones.id,
        tier: 'ULTRA_PREMIUM',
        imageUrl: 'https://store.storeimages.cdn-apple.com/iphone-15-pro-natural.jpg',
      },
      create: {
        slug: 'apple-iphone-15-pro-256gb',
        title: 'Apple iPhone 15 Pro 256GB',
        normalizedTitle: 'apple iphone 15 pro 256gb',
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        categoryId: smartphones.id,
        tier: 'ULTRA_PREMIUM',
        imageUrl: 'https://store.storeimages.cdn-apple.com/iphone-15-pro-natural.jpg',
      },
    });

    const listing1 = await prisma.sourceListing.upsert({
      where: { platformId_externalId: { platformId: amazon.id, externalId: 'B0CHX1' } },
      update: { canonicalProductId: iphone15.id, priceUsd: '749.99', rawTitle: 'Apple iPhone 15 128GB - Blue' },
      create: {
        platformId: amazon.id,
        canonicalProductId: iphone15.id,
        externalId: 'B0CHX1',
        externalUrl: 'https://www.amazon.com/dp/B0CHX1',
        rawTitle: 'Apple iPhone 15 128GB - Blue',
        rawPrice: '749.99',
        rawCurrency: 'USD',
        rawBrand: 'Apple',
        normalizedTitle: 'apple iphone 15 128gb blue',
        extractedBrand: 'Apple',
        extractedModel: 'iPhone 15',
        priceUsd: '749.99',
        inStock: true,
        matchStatus: 'AUTO_MATCHED',
      },
    });

    const listing2 = await prisma.sourceListing.upsert({
      where: { platformId_externalId: { platformId: bestBuy.id, externalId: '6543210' } },
      update: { canonicalProductId: iphone15Pro.id, priceUsd: '1099.00', rawTitle: 'Apple iPhone 15 Pro 256GB' },
      create: {
        platformId: bestBuy.id,
        canonicalProductId: iphone15Pro.id,
        externalId: '6543210',
        externalUrl: 'https://www.bestbuy.com/site/6543210.p',
        rawTitle: 'Apple iPhone 15 Pro 256GB',
        rawPrice: '1099.00',
        rawCurrency: 'USD',
        rawBrand: 'Apple',
        normalizedTitle: 'apple iphone 15 pro 256gb',
        extractedBrand: 'Apple',
        extractedModel: 'iPhone 15 Pro',
        priceUsd: '1099.00',
        inStock: true,
        matchStatus: 'AUTO_MATCHED',
      },
    });

    await prisma.priceHistory.createMany({
      data: [
        { canonicalProductId: iphone15.id, sourceListingId: listing1.id, priceUsd: '749.99', currency: 'USD', inStock: true },
        { canonicalProductId: iphone15Pro.id, sourceListingId: listing2.id, priceUsd: '1099.00', currency: 'USD', inStock: true },
      ],
      skipDuplicates: true,
    });
  }

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

  console.log('Seed complete. Sample Apple products were created for search demos.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
