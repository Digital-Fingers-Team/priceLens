import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AFFILIATE_PROVIDERS } from '../affiliate.constants';
import { AffiliateProvider } from '../interfaces';

/**
 * Resolves a store's AffiliateProvider by key. Depends only on the
 * AFFILIATE_PROVIDERS multi-provider array (dependency inversion) -- it
 * never imports a concrete provider class, so registering a new store never
 * requires editing this file, only adding the new class to that token in
 * AffiliateModule.
 */
@Injectable()
export class AffiliateProviderRegistry {
  private readonly providersByKey = new Map<string, AffiliateProvider>();

  constructor(@Inject(AFFILIATE_PROVIDERS) providers: AffiliateProvider[]) {
    for (const provider of providers) {
      this.providersByKey.set(provider.storeKey, provider);
    }
  }

  resolve(storeKey: string): AffiliateProvider {
    const provider = this.providersByKey.get(storeKey);
    if (!provider) {
      throw new NotFoundException(`No affiliate provider registered for store "${storeKey}"`);
    }
    return provider;
  }

  has(storeKey: string): boolean {
    return this.providersByKey.has(storeKey);
  }
}
