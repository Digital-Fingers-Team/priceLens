// apps/api/src/openapi.ts
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * The OpenAPI document, built the same way for /docs (main.ts), for
 * docs/openapi.json and for the test that checks it (B-11). DTO schemas and
 * field descriptions come from the @nestjs/swagger compiler plugin, so the
 * code building this must be compiled with it: `nest build` does that, and
 * the e2e jest config runs the plugin as a ts-jest transformer.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('PriceLens API')
    .setDescription(
      'Cross-platform price comparison API: one canonical product per item, ' +
        'with every store listing matched to it and its price history.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('admin', 'Admin and moderation tools')
    .addTag('affiliate', 'Affiliate link tracking, store redirects and conversions')
    .addTag('api-keys', 'Workspace API keys for the partner API')
    .addTag('auth', 'Authentication and session management')
    .addTag('billing', 'Plans, checkout and subscriptions')
    .addTag('brand', 'Brand workspace analytics')
    .addTag('deal-hunter', 'Deal discovery')
    .addTag('health', 'Liveness and readiness')
    .addTag('intelligence', 'Market and price intelligence')
    .addTag('notifications', 'Notification channels')
    .addTag('prices', 'Price history and aggregation')
    .addTag('products', 'Canonical products')
    .addTag('search', 'Product search and suggestions')
    .addTag('seller', 'Seller workspace')
    .addTag('watchlist', 'Watchlist and price alerts')
    .build();

  return SwaggerModule.createDocument(app, config);
}
