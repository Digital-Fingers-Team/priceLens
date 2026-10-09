import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

/**
 * Raya Shop (rayashop.com), an Egyptian electronics and appliances chain. Its
 * Nuxt storefront renders search in the browser, but the Magento GraphQL
 * behind it answers plain HTTP on the API host. Product pages are on the
 * site host, as /<store>/<url_key> without ".html".
 */
@Injectable()
export class RayaConnector extends MagentoGraphqlConnector {
  readonly slug = 'raya';
  protected readonly defaultCurrency = 'EGP';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.rayaEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.rayaApiUrl', 'https://api-rayashop.global.ssl.fastly.net');
  }

  protected get siteUrl(): string {
    return this.configService.get<string>('retailers.rayaBaseUrl', 'https://www.rayashop.com');
  }

  protected productUrl(site: string, urlKey: string): string {
    return `${site}/${this.storeCode}/${urlKey}`;
  }
}
