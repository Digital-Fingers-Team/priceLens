import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

@Injectable()
export class TwoBConnector extends MagentoGraphqlConnector {
  readonly slug = '2b';
  protected readonly defaultCurrency = 'EGP';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.twoBEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.twoBBaseUrl', 'https://2b.com.eg');
  }
}
