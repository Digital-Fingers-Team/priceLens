import type { PrismaClient } from '@prisma/client';
import type { StoreDefinition } from '../types';
import { storeDefinitions } from '../factories/storeFactory';

export async function generateStores(prisma: PrismaClient): Promise<Map<string, { id: string; definition: StoreDefinition }>> {
  const stores = new Map<string, { id: string; definition: StoreDefinition }>();

  for (const store of storeDefinitions) {
    const platform = await prisma.platform.upsert({
      where: { slug: store.slug },
      update: {
        name: store.name,
        baseUrl: store.baseUrl,
        connectorType: store.connectorType,
        rateLimit: store.rateLimit,
        isActive: true,
      },
      create: {
        slug: store.slug,
        name: store.name,
        baseUrl: store.baseUrl,
        connectorType: store.connectorType,
        rateLimit: store.rateLimit,
        isActive: true,
      },
    });
    stores.set(store.slug, { id: platform.id, definition: store });
  }

  return stores;
}
