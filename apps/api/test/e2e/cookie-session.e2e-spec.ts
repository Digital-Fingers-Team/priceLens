import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/**
 * Website sessions in httpOnly cookies with double-submit CSRF (D-17,
 * auth/auth-cookies.ts). Bearer clients must keep working unchanged.
 */

type Jar = Record<string, string>;

/** name -> "name=value" from Set-Cookie headers, and the attributes by name. */
function readSetCookie(res: { headers: Record<string, unknown> }): { jar: Jar; attrs: Record<string, string> } {
  const jar: Jar = {};
  const attrs: Record<string, string> = {};
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  for (const line of raw ?? []) {
    const [pair] = line.split(';');
    const name = pair.slice(0, pair.indexOf('='));
    jar[name] = pair;
    attrs[name] = line;
  }
  return { jar, attrs };
}

const cookieHeader = (jar: Jar, ...names: string[]) => names.map((n) => jar[n]).join('; ');
const csrfValue = (jar: Jar) => jar.pl_csrf.split('=')[1];

describe('Cookie sessions (e2e)', () => {
  let app: NestExpressApplication;
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `cookie_${suffix}@example.com`;
  const password = 'CookiePassword123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, username: `ck${suffix}`.slice(0, 20) })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = () =>
    request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Auth-Mode', 'cookie').send({ email, password });

  it('login in cookie mode sets httpOnly token cookies and keeps tokens out of the body', async () => {
    const res = await login().expect(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();

    const { attrs } = readSetCookie(res);
    expect(attrs.pl_at).toMatch(/HttpOnly/);
    expect(attrs.pl_at).toMatch(/Path=\/api(;|$)/);
    expect(attrs.pl_at).toMatch(/SameSite=Lax/);
    expect(attrs.pl_rt).toMatch(/HttpOnly/);
    expect(attrs.pl_rt).toMatch(/Path=\/api\/v1\/auth/);
    expect(attrs.pl_rt).toMatch(/SameSite=Strict/);
    expect(attrs.pl_csrf).not.toMatch(/HttpOnly/);
  });

  it('the access cookie authenticates reads', async () => {
    const { jar } = readSetCookie(await login());
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(jar, 'pl_at'))
      .expect(200);
    expect(me.body.data.email).toBe(email);
  });

  it('a cookie-authenticated write needs the CSRF header to match the cookie', async () => {
    const { jar } = readSetCookie(await login());
    const cookies = cookieHeader(jar, 'pl_at', 'pl_rt', 'pl_csrf');

    const missing = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookies).expect(403);
    expect(missing.body.error.code).toBe('CSRF_TOKEN_INVALID');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', 'not-the-cookie-value')
      .expect(403);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfValue(jar))
      .expect(204);
    // Logout clears all three cookies and ends the session.
    const cleared = (ok.headers['set-cookie'] as unknown as string[]).join('\n');
    for (const name of ['pl_at', 'pl_rt', 'pl_csrf']) expect(cleared).toMatch(new RegExp(`${name}=;`));
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(jar, 'pl_at')).expect(401);
  });

  it('refresh by cookie rotates the session and sets new cookies', async () => {
    const { jar } = readSetCookie(await login());
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Auth-Mode', 'cookie')
      .set('Cookie', cookieHeader(jar, 'pl_rt', 'pl_csrf'))
      .set('X-CSRF-Token', csrfValue(jar))
      .expect(200);
    expect(res.body.data.accessToken).toBeUndefined();
    const next = readSetCookie(res).jar;
    expect(next.pl_at).toBeDefined();
    expect(next.pl_rt).not.toBe(jar.pl_rt);

    // The old refresh cookie was rotated away.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Auth-Mode', 'cookie')
      .set('Cookie', cookieHeader(jar, 'pl_rt', 'pl_csrf'))
      .set('X-CSRF-Token', csrfValue(jar))
      .expect(401);
  });

  it('a stored body refresh token moves into cookies (one-time move out of localStorage)', async () => {
    const legacy = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Auth-Mode', 'cookie')
      .send({ refreshToken: legacy.body.data.refreshToken })
      .expect(200);
    expect(readSetCookie(res).jar.pl_at).toBeDefined();
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it('bearer clients are unchanged: tokens in the body, no cookies, no CSRF needed', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .send({ refreshToken: res.body.data.refreshToken })
      .expect(204);
  });
});
