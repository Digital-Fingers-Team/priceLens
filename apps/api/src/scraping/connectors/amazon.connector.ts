import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLdSearchConnector } from './jsonld-search.connector';

@Injectable()
export class AmazonConnector extends JsonLdSearchConnector {
  readonly slug = 'amazon';
  protected readonly defaultCurrency = 'USD';

  constructor(private readonly configService: ConfigService) {
    super();
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.amazonEnabled', true);
  }

  protected buildSearchUrl(query: string): string {
    const baseUrl = this.configService.get<string>('retailers.amazonBaseUrl', 'https://www.amazon.com');
    return `${baseUrl.replace(/\/$/, '')}/s?k=${encodeURIComponent(query)}`;
  }
}

