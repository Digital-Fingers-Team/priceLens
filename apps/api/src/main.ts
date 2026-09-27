// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule, ENV_FILES } from './app.module';
import { configureApp } from './app.setup';
import { createOpenApiDocument } from './openapi';
import { processRole } from './config/process-role';
import { mountQueueBoard } from './admin/queue-board';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // LOG_FORMAT=json writes one JSON object per line (level, context,
    // message, timestamp, pid) for a log store; production sets it in
    // docker-compose.server.yml (audit 10 OPS-16). Anything else: Nest's
    // text format.
    logger: new ConsoleLogger({
      json: process.env.LOG_FORMAT === 'json',
      logLevels: ['error', 'warn', 'log', 'debug', 'verbose'],
    }),
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

  // The worker serves only its health check.
  if (processRole() !== 'worker') {
    mountQueueBoard(app, `/${process.env.API_PREFIX ?? 'api/v1'}/admin/queues`);
  }

  // ─── Swagger ─────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const document = createOpenApiDocument(app);
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
  logger.log(`PriceLens API running on port ${port} in ${process.env.NODE_ENV} mode (role: ${processRole()})`);
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
