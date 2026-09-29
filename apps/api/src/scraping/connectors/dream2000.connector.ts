import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifySearchConnector } from './shopify-search.connector';

/** Dream 2000 (dream2000.com), an Egyptian electronics and appliances store on Shopify. */
@Injectable()
export class Dream2000Connector extends ShopifySearchConnector {
  readonly slug = 'dream2000';
  protected readonly defaultCurrency = 'EGP';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.dream2000Enabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.dream2000BaseUrl', 'https://dream2000.com');
  }
}
