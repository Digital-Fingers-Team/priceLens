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

  console.log('Seed complete. No sample products were created.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
