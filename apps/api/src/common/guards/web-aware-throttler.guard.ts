import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { isIP } from 'net';

export const WEB_TOKEN_HEADER = 'x-pricelens-web';
export const CLIENT_IP_HEADER = 'x-pricelens-client-ip';

/** Shorter tokens are ignored, so an empty or weak value never opens anything. */
const MIN_TOKEN_LENGTH = 32;

/**
 * The website's own server-side calls (audit 08 P-19, audit 10 OPS-14).
 *
 * Server rendering calls the API directly over the podman network, so every
 * render arrives from the web container's address: one rate-limit bucket for
 * the whole site's pages. A crawler loading uncached pages quickly exhausted
 * it, and the pages turned into 500s for everyone.
 *
 * A render that carries the web's token (WEB_INTERNAL_TOKEN, shared by the
 * API and web containers) is counted as follows:
 *   - with the visitor's address (X-PriceLens-Client-IP, sent by pages that
 *     render per request, e.g. search, which can trigger live scrapes): as
 *     that visitor, under the normal limits;
 *   - without it (cached pages rendered once for everyone: product,
 *     category, home, sitemap): not throttled per address. Those renders are
 *     bounded by the web's page cache, not by a visitor.
 * Requests without the token -- everything from browsers, through nginx --
 * are counted per client address as before.
 */
@Injectable()
export class WebAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    return isWebRender(req) && forwardedClientIp(req) === undefined;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (isWebRender(req)) {
      const clientIp = forwardedClientIp(req);
      if (clientIp) return clientIp;
    }
    return super.getTracker(req);
  }
}

function header(req: Record<string, any>, name: string): string | undefined {
  const value = req.headers?.[name];
  return typeof value === 'string' ? value : undefined;
}

export function isWebRender(req: Record<string, any>): boolean {
  const expected = process.env.WEB_INTERNAL_TOKEN ?? '';
  const given = header(req, WEB_TOKEN_HEADER) ?? '';
  if (expected.length < MIN_TOKEN_LENGTH || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function forwardedClientIp(req: Record<string, any>): string | undefined {
  const value = header(req, CLIENT_IP_HEADER)?.trim();
  return value && isIP(value) ? value : undefined;
}
