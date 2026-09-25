// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule, ENV_FILES } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    // Stripe signs the webhook over the exact request bytes, so the raw body
    // has to survive JSON parsing. Nest keeps it on request.rawBody, which
    // StripeWebhookController reads; every other route is unaffected.
    rawBody: true,
  });

  const logger = new Logger('Bootstrap');
  logger.log(
    ENV_FILES.length > 0
      ? `Loaded env files: ${ENV_FILES.join(', ')}`
      : 'No env file loaded; using the process environment only',
  );

  configureApp(app);

  // ─── Swagger ─────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('PriceLens API')
      .setDescription(
        'Cross-platform price comparison engine API. ' +
        'Uses a 10-step layered matching pipeline to identify and aggregate ' +
        'product listings across multiple shopping platforms.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('auth', 'Authentication & session management')
      .addTag('products', 'Canonical product management')
      .addTag('search', 'Product search and discovery')
      .addTag('prices', 'Price history and aggregation')
      .addTag('watchlist', 'User watchlist')
      .addTag('alerts', 'Price drop alerts')
      .addTag('admin', 'Admin and moderation tools')
      .addTag('affiliate', 'Affiliate link tracking and store redirects')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
    logger.log('Swagger docs available at /docs');
  }

  // ─── Graceful Shutdown ────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`PriceLens API running on port ${port} in ${process.env.NODE_ENV} mode`);
}

bootstrap().catch((err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Fatal bootstrap error: Port ${err?.port ?? process.env.PORT ?? 3001} is already in use. ` +
      'Stop the conflicting process and restart the API.',
    );
    process.exit(1);
  }
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
