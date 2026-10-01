import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopifySearchConnector } from './shopify-search.connector';

/** Compumarts (compumarts.com), a computer and electronics chain with branches in Egypt, on Shopify. */
@Injectable()
export class CompumartsConnector extends ShopifySearchConnector {
  readonly slug = 'compumarts';
  protected readonly defaultCurrency = 'EGP';
  // Answers on the default locale only (a /en prefix returns HTML).
  protected readonly locale: string = '';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.compumartsEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.compumartsBaseUrl', 'https://compumarts.com');
  }
}
