import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

/**
 * Seoudi (seoudisupermarket.com), a Cairo supermarket chain. Its Nuxt shop
 * reads a Magento GraphQL on mcprod.seoudisupermarket.com over GET ("default"
 * store view); plain HTTP works there, while the site itself sits behind
 * Cloudflare. SKUs are the barcodes. Product pages are /en/<url_key>.html.
 */
@Injectable()
export class SeoudiConnector extends MagentoGraphqlConnector {
  readonly slug = 'seoudi';
  readonly probeQuery = 'milk,water';
  protected readonly defaultCurrency = 'EGP';
  protected readonly storeCode = 'default';
  protected readonly useGet = true;
  protected readonly skuIsBarcode = true;

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.seoudiEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.seoudiApiUrl', 'https://mcprod.seoudisupermarket.com');
  }

  protected get siteUrl(): string {
    return this.configService.get<string>('retailers.seoudiBaseUrl', 'https://seoudisupermarket.com');
  }

  protected productUrl(site: string, urlKey: string, suffix: string): string {
    return `${site}/en/${urlKey}${suffix}`;
  }
}
