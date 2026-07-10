import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

@Injectable()
export class ElarabyConnector extends MagentoGraphqlConnector {
  readonly slug = 'elaraby';
  protected readonly defaultCurrency = 'EGP';

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.elarabyEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.elarabyBaseUrl', 'https://www.elarabygroup.com');
  }
}
