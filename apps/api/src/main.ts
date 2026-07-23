// apps/api/src/main.ts
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
const helmet: any = require('helmet');
const compression: any = require('compression');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const logger = new Logger('Bootstrap');
  const httpServer: any = app.getHttpAdapter().getInstance();

  httpServer.get('/', (_req: any, res: any) => {
    res.status(200).json({
      success: true,
      data: {
        service: 'PriceLens API',
        status: 'ok',
        docs: '/docs',
        health: '/health',
        apiPrefix: process.env.API_PREFIX ?? 'api/v1',
      },
    });
  });

  httpServer.get('/health', (_req: any, res: any) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
      },
    });
  });

  // ─── Security ───────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  app.use(compression());

  // ─── CORS ────────────────────────────────────────────────────────────────
  const configuredOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

  app.enableCors({
    origin: (origin, callback) => {
      if (configuredOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin "${origin}" is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // ─── Global Prefix ────────────────────────────────────────────────────────
  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // ─── Validation ──────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,          // auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: false,  // collect all errors
    }),
  );

  // ─── Global Interceptors ─────────────────────────────────────────────────
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(reflector),
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );

  // ─── Global Filters ───────────────────────────────────────────────────────
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new PrismaExceptionFilter(),
  );

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
