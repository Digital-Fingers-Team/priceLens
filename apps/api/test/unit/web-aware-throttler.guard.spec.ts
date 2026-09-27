import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CLIENT_IP_HEADER,
  WEB_TOKEN_HEADER,
  WebAwareThrottlerGuard,
  isWebRender,
} from '../../src/common/guards/web-aware-throttler.guard';

const TOKEN = 'a'.repeat(48);

function request(headers: Record<string, string>, ip = '10.89.1.40') {
  return { ip, headers };
}

function contextFor(req: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('WebAwareThrottlerGuard (OPS-14)', () => {
  const guard = new WebAwareThrottlerGuard([], {} as never, new Reflector()) as unknown as {
    shouldSkip(context: ExecutionContext): Promise<boolean>;
    getTracker(req: object): Promise<string>;
  };
  const saved = process.env.WEB_INTERNAL_TOKEN;

  beforeEach(() => {
    process.env.WEB_INTERNAL_TOKEN = TOKEN;
  });
  afterAll(() => {
    process.env.WEB_INTERNAL_TOKEN = saved;
  });

  it('counts a browser request by its own address', async () => {
    const req = request({}, '196.154.91.231');
    expect(await guard.shouldSkip(contextFor(req))).toBe(false);
    expect(await guard.getTracker(req)).toBe('196.154.91.231');
  });

  it('counts a web render that forwards the visitor as that visitor', async () => {
    const req = request({ [WEB_TOKEN_HEADER]: TOKEN, [CLIENT_IP_HEADER]: '196.154.91.231' });
    expect(await guard.shouldSkip(contextFor(req))).toBe(false);
    expect(await guard.getTracker(req)).toBe('196.154.91.231');
  });

  it('does not throttle a cached-page render without a visitor', async () => {
    const req = request({ [WEB_TOKEN_HEADER]: TOKEN });
    expect(await guard.shouldSkip(contextFor(req))).toBe(true);
  });

  it('ignores a forwarded address without the token', async () => {
    const req = request({ [CLIENT_IP_HEADER]: '1.2.3.4' }, '196.154.91.231');
    expect(await guard.shouldSkip(contextFor(req))).toBe(false);
    expect(await guard.getTracker(req)).toBe('196.154.91.231');
  });

  it('ignores a wrong token and a malformed forwarded address', async () => {
    const wrong = request({ [WEB_TOKEN_HEADER]: 'b'.repeat(48) });
    expect(await guard.shouldSkip(contextFor(wrong))).toBe(false);

    const junk = request({ [WEB_TOKEN_HEADER]: TOKEN, [CLIENT_IP_HEADER]: 'not-an-ip' });
    expect(await guard.shouldSkip(contextFor(junk))).toBe(true);
    expect(await guard.getTracker(junk)).toBe('10.89.1.40');
  });

  it('is off while the token is unset or too short', () => {
    process.env.WEB_INTERNAL_TOKEN = '';
    expect(isWebRender(request({ [WEB_TOKEN_HEADER]: '' }))).toBe(false);
    process.env.WEB_INTERNAL_TOKEN = 'short';
    expect(isWebRender(request({ [WEB_TOKEN_HEADER]: 'short' }))).toBe(false);
  });
});
