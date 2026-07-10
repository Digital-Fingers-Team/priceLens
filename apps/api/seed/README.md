# PriceLens Seed System

This seed pipeline generates structured marketplace data for search, matching, price comparison, price history charts, and admin review workflows.

By default `pnpm db:seed` only bootstraps users, categories, and store/platform rows — it no longer generates synthetic canonical products, listings, or price history, since real catalog data now comes from `LiveIngestionService`. Set `SEED_GENERATE_PRODUCTS=true` to opt back into the synthetic dataset (e.g. for local development without live scraping, or load-testing search/matching). To remove synthetic demo products already in the database, run `pnpm seed:purge-demo` (see `purgeDemoProducts.ts`) — it identifies them by their `dummyimage.com` placeholder image, so real ingested products are left untouched.

## Profiles

`pnpm db:seed` defaults to `SEED_PROFILE=full` (only relevant when `SEED_GENERATE_PRODUCTS=true`).

| Profile | Products | Listings/product | Challenge listings | History/listing |
| --- | ---: | ---: | ---: | ---: |
| `demo` | 240 | 5 | 120 | 35 |
| `medium` | 5,000 | 7 | 2,500 | 60 |
| `full` | 51,000 | 10 | 20,000 | 40 |

Full profile produces about 51k canonical products, 510k canonical-linked listings, 20k matching challenge listings, and 20.4M price history rows.

## Commands

```bash
SEED_PROFILE=demo pnpm db:seed
SEED_PROFILE=full SEED_RESET=true pnpm db:seed
SEED_PROFILE=medium SEED_BATCH_SIZE=5000 pnpm db:seed
```

## Environment

- `SEED_GENERATE_PRODUCTS=true` enables synthetic canonical product/listing/price-history generation; omitted or any other value skips it
- `SEED_PROFILE=full|medium|demo`, default `full`
- `SEED_RESET=true` deletes generated marketplace rows before seeding
- `SEED_RESUME=false` starts a new run instead of resuming an active one
- `SEED_BATCH_SIZE` controls COPY batch size
- `SEED_HISTORY_TARGET` overrides history rows per listing
- `SEED_NOW` fixes the seed clock for deterministic dates
- `SEED_LOG_INTERVAL` controls progress logging

## Architecture

- Datasets define realistic product catalogs by category, brand, model, variant, storage, RAM, colors, editions, and release years.
- Factories convert catalog combinations into canonical products, marketplace-specific listings, and price history rows.
- Generators upsert reference data and stream high-volume rows into PostgreSQL using temporary-table COPY plus `ON CONFLICT DO NOTHING`.
- `seed_runs` and `seed_checkpoints` record progress so interrupted runs can resume.

## Indexes

The `20260605000000_seed_scale_indexes` migration adds trigram search indexes, filtered listing price indexes, BRIN history indexes, and covering history lookup indexes. These are important for the large profile; apply migrations before running the full seed.
