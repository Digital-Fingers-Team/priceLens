import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { mountQueueBoard } from '../../src/admin/queue-board';
import { PrismaService } from '../../src/database/prisma.service';

/** The queue dashboard (OPS-18): admins only, invisible to everyone else. */
describe('Queue board (e2e)', () => {
  let app: NestExpressApplication;
  const BASE = '/api/v1/admin/queues';
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const password = 'QueueBoardPass123';
  let userToken: string;
  let adminToken: string;

  async function register(tag: string): Promise<{ email: string; token: string }> {
    const email = `qb_${tag}_${suffix}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, username: `qb${tag}${suffix}`.slice(0, 20) })
      .expect(201);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { email, token: login.body.data.accessToken };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app);
    mountQueueBoard(app, BASE);
    await app.init();

    userToken = (await register('u')).token;
    const admin = await register('a');
    await app.get(PrismaService).user.update({ where: { email: admin.email }, data: { role: 'ADMIN' } });
    adminToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('is a 404 when signed out, for a normal user and for a bad token', async () => {
    await request(app.getHttpServer()).get(BASE).expect(404);
    await request(app.getHttpServer()).get(BASE).set('Authorization', `Bearer ${userToken}`).expect(404);
    await request(app.getHttpServer()).get(BASE).set('Authorization', 'Bearer not.a.token').expect(404);
    await request(app.getHttpServer()).get(`${BASE}/api/queues`).set('Authorization', `Bearer ${userToken}`).expect(404);
  });

  it('shows the queues to an admin', async () => {
    const page = await request(app.getHttpServer()).get(BASE).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(page.text).toMatch(/<html/i);
    const queues = await request(app.getHttpServer())
      .get(`${BASE}/api/queues`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const names = (queues.body.queues as Array<{ name: string }>).map((q) => q.name).sort();
    expect(names).toEqual(['affiliate-conversion', 'ingestion']);
  });

  it('refuses an admin write from another origin', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/api/queues/ingestion/retry/failed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Origin', 'https://evil.example')
      .expect(403);
  });
});
