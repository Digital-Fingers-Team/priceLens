import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLdSearchConnector } from './jsonld-search.connector';

@Injectable()
export class JumiaConnector extends JsonLdSearchConnector {
  readonly slug = 'jumia';
  protected readonly defaultCurrency = 'EGP';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.jumiaEnabled', true);
  }

  protected buildSearchUrl(query: string): string {
    const baseUrl = this.configService.get<string>('retailers.jumiaBaseUrl', 'https://www.jumia.com.eg');
    return `${baseUrl.replace(/\/$/, '')}/catalog/?q=${encodeURIComponent(query)}`;
  }
}

