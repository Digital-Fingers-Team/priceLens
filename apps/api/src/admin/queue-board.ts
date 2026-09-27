import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bull';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bull';
import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ACCESS_COOKIE, requestCookies } from '../auth/auth-cookies';
import type { TokenPayload } from '../auth/interfaces/auth.interfaces';
import { allowedCorsOrigins } from '../config/site-origins';
import { AFFILIATE_CONVERSION_QUEUE } from '../affiliate/affiliate.constants';
import { INGESTION_QUEUE } from '../workers/ingestion.jobs';

const QUEUES = [INGESTION_QUEUE, AFFILIATE_CONVERSION_QUEUE];

/**
 * The job queues' dashboard (bull-board) at /api/v1/admin/queues, for admins
 * only (audit 10 OPS-18). Waiting, active, failed and delayed jobs with their
 * data and errors; retry and clean from the page.
 *
 * Mounted on Express directly (the library's documented setup), so the Nest
 * guards do not run here; this middleware does their job:
 *   - the same access token the website uses (httpOnly cookie, or a bearer
 *     header), checked against its session like every other request;
 *   - role ADMIN, and anything else -- signed out included -- gets a 404, so
 *     the page does not advertise itself;
 *   - writes (retry, clean) only from the site's own origin: the session
 *     cookie is SameSite=Lax, which other sites cannot use, but sibling
 *     subdomains count as the same site.
 */
export function mountQueueBoard(app: INestApplication, basePath: string): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: QUEUES.map(
      (name) => new BullAdapter(app.get<Queue>(getQueueToken(name), { strict: false })),
    ),
    serverAdapter,
  });

  const jwt = app.get(JwtService, { strict: false });
  const auth = app.get(AuthService, { strict: false });
  const secret = app.get(ConfigService).get<string>('auth.jwtAccessSecret');

  const adminOnly = async (req: Request, res: Response, next: NextFunction) => {
    const notFound = () => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    try {
      const header = req.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice(7) : requestCookies(req)[ACCESS_COOKIE];
      if (!token) return notFound();
      const payload = await jwt.verifyAsync<TokenPayload>(token, { secret });
      const user = await auth.validateJwtUser(payload);
      if (user.role !== 'ADMIN') return notFound();
      if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cross-origin write refused' } });
      }
      return next();
    } catch {
      return notFound();
    }
  };

  app.use(basePath, adminOnly, serverAdapter.getRouter());
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const { any, origins } = allowedCorsOrigins();
  return any || origins.includes(origin);
}
