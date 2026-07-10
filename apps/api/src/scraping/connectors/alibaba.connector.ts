import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonLdSearchConnector } from './jsonld-search.connector';

@Injectable()
export class AlibabaConnector extends JsonLdSearchConnector {
  readonly slug = 'alibaba';
  protected readonly defaultCurrency = 'USD';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.alibabaEnabled', true);
  }

  protected buildSearchUrl(query: string): string {
    const baseUrl = this.configService.get<string>('retailers.alibabaBaseUrl', 'https://www.alibaba.com');
    return `${baseUrl.replace(/\/$/, '')}/trade/search?SearchText=${encodeURIComponent(query)}`;
  }
}

