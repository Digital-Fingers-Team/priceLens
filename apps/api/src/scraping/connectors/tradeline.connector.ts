import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifySearchConnector } from './shopify-search.connector';

/** Tradeline (tradelinestores.com), an Apple premium reseller with stores across Egypt, on Shopify. */
@Injectable()
export class TradelineConnector extends ShopifySearchConnector {
  readonly slug = 'tradeline';
  protected readonly defaultCurrency = 'EGP';
  // Answers on the default locale only (a /en prefix returns HTML).
  protected readonly locale: string = '';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.tradelineEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.tradelineBaseUrl', 'https://tradelinestores.com');
  }
}
