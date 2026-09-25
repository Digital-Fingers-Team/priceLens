// apps/api/src/app.setup.ts
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AppException } from './common/errors/app.exception';

/**
 * Everything that shapes request handling -- routes outside the prefix,
 * proxy trust, security headers, CORS, validation, response envelope, error
 * filters. Shared by main.ts and the test suites so tests exercise the exact
 * pipeline production runs, not a hand-copied approximation of it.
 */
export function configureApp(app: NestExpressApplication): void {
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

  // ─── Proxy ──────────────────────────────────────────────────────────────
  // The API runs behind the nginx reverse proxy, so without this every request
  // carries the proxy's IP: rate limiting would bucket all users together as a
  // single client, and session audit rows would record the proxy instead of the
  // real client. Trust exactly one hop — the proxy in front of us — so a
  // client-supplied X-Forwarded-For cannot be used to spoof an address.
  const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
  app.set('trust proxy', Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

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
      callback(new AppException(403, 'CORS_ORIGIN_NOT_ALLOWED', `Origin "${origin}" is not allowed by CORS`));
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
  // One filter for every error, so every failure has the same envelope.
  app.useGlobalFilters(new ApiExceptionFilter());
}
