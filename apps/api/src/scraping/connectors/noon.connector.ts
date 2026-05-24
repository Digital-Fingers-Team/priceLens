import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLdSearchConnector } from './jsonld-search.connector';

@Injectable()
export class NoonConnector extends JsonLdSearchConnector {
  readonly slug = 'noon';
  protected readonly defaultCurrency = 'AED';

  constructor(private readonly configService: ConfigService) {
    super();
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.noonEnabled', true);
  }

  protected buildSearchUrl(query: string): string {
    const baseUrl = this.configService.get<string>('retailers.noonBaseUrl', 'https://www.noon.com');
    return `${baseUrl.replace(/\/$/, '')}/uae-en/search?q=${encodeURIComponent(query)}`;
  }
}

