import { Inject, Injectable } from '@nestjs/common';
import type { RetailerConnector } from '../interfaces/retailer-connector.interface';
import { AlibabaConnector } from './alibaba.connector';
import { AliExpressConnector } from './aliexpress.connector';
import { AmazonConnector } from './amazon.connector';
import { CarrefourConnector } from './carrefour.connector';
import { ElarabyConnector } from './elaraby.connector';
import { JumiaConnector } from './jumia.connector';
import { NoonConnector } from './noon.connector';
import { TwoBConnector } from './twob.connector';

/**
 * Every store adapter. Adding a store = write a class implementing
 * RetailerConnector (usually by extending JsonLdSearchConnector or
 * MagentoGraphqlConnector), add it here, and add its platform row. Nothing
 * in the ingestion core names a store.
 *
 * The order is the default ingestion order for "all stores".
 */
export const CONNECTOR_CLASSES = [
  AmazonConnector,
  AlibabaConnector,
  AliExpressConnector,
  NoonConnector,
  JumiaConnector,
  CarrefourConnector,
  TwoBConnector,
  ElarabyConnector,
] as const;

/** Injection token for the list of connector instances, in CONNECTOR_CLASSES order. */
export const RETAILER_CONNECTORS = Symbol('RETAILER_CONNECTORS');

export const retailerConnectorsProvider = {
  provide: RETAILER_CONNECTORS,
  useFactory: (...connectors: RetailerConnector[]) => connectors,
  inject: [...CONNECTOR_CLASSES],
};

/** Looks connectors up by platform slug. */
@Injectable()
export class ConnectorRegistry {
  private readonly bySlug: Map<string, RetailerConnector>;

  constructor(@Inject(RETAILER_CONNECTORS) connectors: RetailerConnector[]) {
    this.bySlug = new Map(connectors.map((connector) => [connector.slug, connector]));
  }

  /** Every registered slug, enabled or not. */
  slugs(): string[] {
    return Array.from(this.bySlug.keys());
  }

  get(slug: string): RetailerConnector | undefined {
    return this.bySlug.get(slug);
  }

  has(slug: string): boolean {
    return this.bySlug.has(slug);
  }

  /** True when the store has a connector and it is switched on. */
  isEnabled(slug: string): boolean {
    return !!this.bySlug.get(slug)?.isEnabled;
  }
}
