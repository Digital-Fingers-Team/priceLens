// apps/api/test/integration/auth-sessions.integration.spec.ts
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService, REFRESH_REUSE_GRACE_MS, hashRefreshToken } from '../../src/auth/auth.service';

/**
 * Phase 04 session security: each test is an attack that used to work
 * (S-04 access token outlives logout, S-05 rotation race and token replay,
 * S-06 plaintext refresh tokens, S-10 login timing, S-16 session lifetime).
 */
describe('Auth sessions (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let user: User;

  const jti = (token: string): string =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).jti as string;
  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);

    const suffix = Date.now().toString(36);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `sessions_${suffix}@example.com`, username: `sess${suffix}`, password: 'TestPass123' })
      .expect(201);
    user = await prisma.user.findUniqueOrThrow({ where: { email: `sessions_${suffix}@example.com` } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: user.id } });
    await app.close();
  });

  it('logout ends the access token immediately, not when it expires (S-04)', async () => {
    const tokens = await auth.login(user);
    await me(tokens.accessToken).expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(204);
    await me(tokens.accessToken).expect(401);
    await refresh(tokens.refreshToken).expect(401);
  });

  it('"log out everywhere" ends the other devices\' access tokens (S-04)', async () => {
    const phone = await auth.login(user);
    const laptop = await auth.login(user);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .expect(204);
    await me(phone.accessToken).expect(401);
    await me(laptop.accessToken).expect(401);
  });

  it('logout cannot revoke another user\'s session with their refresh token', async () => {
    const mine = await auth.login(user);
    const suffix = `${Date.now().toString(36)}b`;
    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `sessions_${suffix}@example.com`, username: `sess${suffix}`, password: 'TestPass123' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${other.body.data.accessToken}`)
      .send({ refreshToken: mine.refreshToken })
      .expect(204);
    await me(mine.accessToken).expect(200);
    await prisma.user.delete({ where: { email: `sessions_${suffix}@example.com` } });
  });

  it('stores only a hash of the refresh token, and the session lasts as long as the token (S-06, S-16)', async () => {
    const tokens = await auth.login(user);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: jti(tokens.accessToken) } });
    expect(session.refreshToken).toBe(hashRefreshToken(tokens.refreshToken));
    expect(session.refreshToken).not.toContain(tokens.refreshToken.slice(0, 20));

    const { exp } = JSON.parse(Buffer.from(tokens.refreshToken.split('.')[1], 'base64url').toString());
    expect(session.expiresAt.getTime()).toBe(exp * 1000);
  });

  it('two concurrent refreshes with one token cannot both succeed (S-05)', async () => {
    const tokens = await auth.login(user);
    const results = await Promise.all([refresh(tokens.refreshToken), refresh(tokens.refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('a rotated token replayed within the grace window is refused without ending the session', async () => {
    const tokens = await auth.login(user);
    const rotated = (await refresh(tokens.refreshToken).expect(200)).body.data;
    await refresh(tokens.refreshToken).expect(401);
    await me(rotated.accessToken).expect(200);
  });

  it('a rotated token replayed after the grace window ends every session (S-05 reuse detection)', async () => {
    const tokens = await auth.login(user);
    const rotated = (await refresh(tokens.refreshToken).expect(200)).body.data;
    await prisma.session.update({
      where: { id: jti(tokens.accessToken) },
      data: { rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000) },
    });

    await refresh(tokens.refreshToken).expect(401);
    await me(rotated.accessToken).expect(401);
    await refresh(rotated.refreshToken).expect(401);
  });

  it('sessions created before hashing (raw token stored) still refresh', async () => {
    const tokens = await auth.login(user);
    await prisma.session.update({
      where: { id: jti(tokens.accessToken) },
      data: { refreshToken: tokens.refreshToken },
    });
    await refresh(tokens.refreshToken).expect(200);
  });

  it('an unknown e-mail costs a real bcrypt comparison (S-10)', async () => {
    const dummy = await auth.timingDummyHash();
    expect(bcrypt.getRounds(dummy)).toBe(12);
    await expect(bcrypt.compare('anything', dummy)).resolves.toBe(false);
  });
});
