import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractQuantitySpec } from '../../matching/text/specs';
import { MagentoGraphqlConnector } from './magento-graphql.connector';

/** "juhayna-skimmed-milk-200ml" -> "200ml", "rice-1-kg" -> "1 kg": a size the URL key states. */
const SIZE_IN_URL_KEY = /(?<![a-z0-9])(\d+(?:\.\d+)?)\s?(ml|l|ltr|g|gm|kg)(?![a-z])/i;

/**
 * Gourmet Egypt (gourmetegypt.com), a Cairo supermarket chain. Plain HTTP
 * Magento GraphQL ("default" store view). Its SKUs are the barcodes, so its
 * products match other stores by GTIN. Product pages are /<url_key>.
 */
@Injectable()
export class GourmetConnector extends MagentoGraphqlConnector {
  readonly slug = 'gourmet';
  readonly probeQuery = 'milk,water';
  protected readonly defaultCurrency = 'EGP';
  protected readonly storeCode = 'default';
  protected readonly skuIsBarcode = true;

  constructor(configService: ConfigService) {
    super(configService);
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('retailers.gourmetEnabled', true);
  }

  protected get baseUrl(): string {
    return this.configService.get<string>('retailers.gourmetBaseUrl', 'https://gourmetegypt.com');
  }

  protected productUrl(site: string, urlKey: string): string {
    return `${site}/${urlKey}`;
  }

  /**
   * Gourmet names one product the same in every size ("Juhayna Skimmed Milk"
   * is the 200 ml and the 1 L); the size is often only in the URL key. A
   * title without it would match the wrong size elsewhere.
   */
  protected listingTitle({ name, urlKey }: { name: string; urlKey?: string }): string {
    const stated = extractQuantitySpec(name);
    if (stated.volumeMl !== undefined || stated.weightG !== undefined) return name;
    const size = SIZE_IN_URL_KEY.exec((urlKey ?? '').replace(/-/g, ' '));
    return size ? `${name} ${size[1]}${size[2].toLowerCase()}` : name;
  }
}
