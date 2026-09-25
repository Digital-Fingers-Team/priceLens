# 0006. Store adapters are registered in one list; the core never names a store

Date: 2026-09-25 · Status: Accepted · Phase 01

## Context

Every store already implemented one interface, `RetailerConnector` (`slug`, `isEnabled`, `searchListings`). But `LiveIngestionService` injected the eight connector classes by name and built its own map, and `ScrapingModule` listed them twice, so adding a store meant editing the ingestion core.

## Decision

`scraping/connectors/connector.registry.ts` holds `CONNECTOR_CLASSES`, the one list of store adapters. A factory provider turns it into the `RETAILER_CONNECTORS` array, and `ConnectorRegistry` looks connectors up by slug. The ingestion services depend on the registry only.

## Consequences

- Adding a store: a connector class (usually extending `JsonLdSearchConnector` or `MagentoGraphqlConnector`), one line in `CONNECTOR_CLASSES`, its config keys, and a `platforms` row with the same slug.
- Tests replace a store by overriding its class (`overrideProvider(NoonConnector)`), which the factory picks up; the e2e suites do this.
- The same pattern already existed for affiliate providers (`AFFILIATE_PROVIDERS`); the two now match.
