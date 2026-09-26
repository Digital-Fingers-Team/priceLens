import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { createOpenApiDocument } from '../../src/openapi';

/**
 * The OpenAPI document covers every route, and docs/openapi.json is current
 * (B-11). The e2e jest config compiles with the @nestjs/swagger plugin, as
 * `nest build` does, so DTO schemas are in the document.
 *
 * After changing a route or DTO, regenerate the file:
 *   UPDATE_OPENAPI=1 pnpm --filter @pricelens/api test:e2e -- openapi
 */

const COMMITTED = path.resolve(__dirname, '../../../../docs/openapi.json');

/** Routes deliberately left out of the document. */
const UNDOCUMENTED = [
  '/api/v1/billing/webhook', // @ApiExcludeController: Stripe calls it, not API clients
  '/api/v1/partner/', // @ApiExcludeController: its own snake_case contract
];

/** The plain-Express service banner in app.setup.ts. */
const EXPRESS_ONLY = ['GET /'];

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

function registeredRoutes(app: NestExpressApplication): string[] {
  const stack = (app.getHttpAdapter().getInstance() as { _router: { stack: ExpressLayer[] } })._router.stack;
  return stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route!.methods).map(
        (method) => `${method.toUpperCase()} ${layer.route!.path.replace(/:(\w+)/g, '{$1}')}`,
      ),
    )
    .filter((route) => !EXPRESS_ONLY.includes(route))
    .filter((route) => !UNDOCUMENTED.some((prefix) => route.split(' ')[1].startsWith(prefix)))
    .sort();
}

function documentedRoutes(document: OpenAPIObject): string[] {
  return Object.entries(document.paths)
    .flatMap(([route, operations]) =>
      Object.keys(operations).map((method) => `${method.toUpperCase()} ${route}`),
    )
    .sort();
}

describe('OpenAPI document (e2e)', () => {
  let app: NestExpressApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    document = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documents every registered route, and nothing else', () => {
    expect(documentedRoutes(document)).toEqual(registeredRoutes(app));
  });

  it('carries DTO schemas from the compiler plugin', () => {
    const schemas = Object.keys(document.components?.schemas ?? {});
    expect(schemas).toEqual(expect.arrayContaining(['LoginDto', 'RegisterDto']));
  });

  it('docs/openapi.json is current', () => {
    const generated = `${JSON.stringify(document, null, 2)}\n`;
    if (process.env.UPDATE_OPENAPI === '1') {
      fs.writeFileSync(COMMITTED, generated);
    }
    expect(fs.existsSync(COMMITTED) ? fs.readFileSync(COMMITTED, 'utf8') : '').toBe(generated);
  });
});
