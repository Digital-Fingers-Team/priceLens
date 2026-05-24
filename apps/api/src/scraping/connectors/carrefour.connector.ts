import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLdSearchConnector } from './jsonld-search.connector';

@Injectable()
export class CarrefourConnector extends JsonLdSearchConnector {
  readonly slug = 'carrefour';
  protected readonly defaultCurrency = 'AED';

  constructor(private readonly configService: ConfigService) {
    super();
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.carrefourEnabled', true);
  }

  protected buildSearchUrl(query: string): string {
    const baseUrl = this.configService.get<string>(
      'retailers.carrefourBaseUrl',
      'https://www.carrefouruae.com',
    );
    return `${baseUrl.replace(/\/$/, '')}/mafuae/en/search?text=${encodeURIComponent(query)}`;
  }
}

