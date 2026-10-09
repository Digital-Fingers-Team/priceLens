import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

/**
 * Fresh (fresh.com.eg), the Egyptian appliance maker's own shop: the
 * official price of products B.TECH, Raya and others also sell. Its Nuxt
 * storefront calls a Magento GraphQL on freshmprod.hypernode.io, which
 * answers plain HTTP with the "default" store view. Product pages are
 * /en/products/<url_key> on the site host.
 */
@Injectable()
export class FreshConnector extends MagentoGraphqlConnector {
  readonly slug = 'fresh';
  protected readonly defaultCurrency = 'EGP';
  protected readonly storeCode = 'default';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.freshEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.freshApiUrl', 'https://freshmprod.hypernode.io');
  }

  protected get siteUrl(): string {
    return this.configService.get<string>('retailers.freshBaseUrl', 'https://fresh.com.eg');
  }

  protected productUrl(site: string, urlKey: string): string {
    return `${site}/en/products/${urlKey}`;
  }
}
