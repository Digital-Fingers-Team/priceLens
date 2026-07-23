import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CONVERSION_PROVIDERS } from '../affiliate.constants';
import { ConversionProvider } from '../interfaces';

/** Same pattern as AffiliateProviderRegistry: resolves by key, never imports a concrete provider class. */
@Injectable()
export class ConversionProviderRegistry {
  private readonly providersByKey = new Map<string, ConversionProvider>();

  constructor(@Inject(CONVERSION_PROVIDERS) providers: ConversionProvider[]) {
    for (const provider of providers) {
      this.providersByKey.set(provider.networkKey, provider);
    }
  }

  resolve(networkKey: string): ConversionProvider {
    const provider = this.providersByKey.get(networkKey);
    if (!provider) {
      throw new NotFoundException(`No conversion provider registered for network "${networkKey}"`);
    }
    return provider;
  }

  all(): ConversionProvider[] {
    return [...this.providersByKey.values()];
  }
}
