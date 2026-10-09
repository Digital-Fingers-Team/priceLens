import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

/**
 * Spinneys Egypt (spinneys-egypt.com), a supermarket chain. Its Nuxt shop
 * reads a Magento GraphQL that answers GET ("default" store view); a POST
 * gets a server error. Product pages are /en/<url_key>, without ".html".
 */
@Injectable()
export class SpinneysConnector extends MagentoGraphqlConnector {
  readonly slug = 'spinneys';
  readonly probeQuery = 'milk,water';
  protected readonly defaultCurrency = 'EGP';
  protected readonly storeCode = 'default';
  protected readonly useGet = true;

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.spinneysEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.spinneysBaseUrl', 'https://www.spinneys-egypt.com');
  }

  protected productUrl(site: string, urlKey: string): string {
    return `${site}/en/${urlKey}`;
  }
}
