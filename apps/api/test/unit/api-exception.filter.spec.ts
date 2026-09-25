import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { UpgradeRequiredException, PlanLimitExceededException } from '../../src/billing/billing.errors';
import { FEATURES } from '../../src/billing/plan-limits';
import { AppException } from '../../src/common/errors/app.exception';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';

function run(exception: unknown) {
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  const req = { method: 'GET', url: '/api/v1/thing', headers: { 'x-request-id': 'req-1' } };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  const body = res.body as { success: boolean; error: Record<string, unknown> };
  return { status: res.statusCode, success: body.success, error: body.error };
}

describe('ApiExceptionFilter', () => {
  it('always answers with the envelope, request id, timestamp and path', () => {
    const { status, success, error } = run(new NotFoundException('No product matches "x"'));
    expect(status).toBe(404);
    expect(success).toBe(false);
    expect(error).toEqual({
      code: 'NOT_FOUND',
      message: 'No product matches "x"',
      requestId: 'req-1',
      timestamp: expect.any(String),
      path: '/api/v1/thing',
    });
  });

  it('puts validation messages in details', () => {
    const { status, error } = run(new BadRequestException(['email must be an email', 'password is too short']));
    expect(status).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual(['email must be an email', 'password is too short']);
  });

  it('keeps a domain code and its details (the paywall needs them)', () => {
    const { status, error } = run(new UpgradeRequiredException('Buy verdicts need Pro.', { feature: FEATURES.BUY_VERDICT, requiredTier: 'PRO' }));
    expect(status).toBe(403);
    expect(error.code).toBe('UPGRADE_REQUIRED');
    expect(error.message).toBe('Buy verdicts need Pro.');
    expect(error.details).toEqual({ feature: 'buy_verdict', requiredTier: 'PRO' });

    const limit = run(new PlanLimitExceededException('tracked products', 10, 10));
    expect(limit.error.code).toBe('UPGRADE_REQUIRED');
    expect(limit.error.details).toEqual({ limit: 10, current: 10 });
  });

  it('supports AppException for new domain errors', () => {
    const { status, error } = run(new AppException(403, 'CORS_ORIGIN_NOT_ALLOWED', 'Origin "x" is not allowed'));
    expect(status).toBe(403);
    expect(error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    expect(error).not.toHaveProperty('details');
  });

  it('maps throttling to RATE_LIMITED', () => {
    const { status, error } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(error.code).toBe('RATE_LIMITED');
  });

  it('maps an HttpException with extra fields and no code by status', () => {
    const { error } = run(new HttpException({ statusCode: 429, error: 'QuotaExceeded', code: 'QUOTA_EXCEEDED', message: 'Daily quota', used: 5, limit: 5 }, 429));
    expect(error.code).toBe('QUOTA_EXCEEDED');
    expect(error.details).toEqual({ used: 5, limit: 5 });
    expect(run(new HttpException('Gone', HttpStatus.GONE)).error.code).toBe('UNKNOWN_ERROR');
  });

  it('maps Prisma errors', () => {
    const known = (code: string, meta?: Record<string, unknown>) =>
      new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: '5', meta });
    expect(run(known('P2002', { target: ['email'] }))).toMatchObject({
      status: 409,
      error: { code: 'DUPLICATE_RECORD', message: 'A record with this email already exists' },
    });
    expect(run(known('P2025'))).toMatchObject({ status: 404, error: { code: 'NOT_FOUND' } });
    expect(run(known('P2003'))).toMatchObject({ status: 400, error: { code: 'INVALID_REFERENCE' } });
    expect(run(known('P9999'))).toMatchObject({ status: 500, error: { code: 'DATABASE_ERROR' } });
    expect(run(new Prisma.PrismaClientValidationError('bad', { clientVersion: '5' }))).toMatchObject({
      status: 400,
      error: { code: 'QUERY_VALIDATION_ERROR' },
    });
  });

  it('turns anything else into a 500 that reveals nothing', () => {
    const { status, error } = run(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    expect(status).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('Internal server error');
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(run('a thrown string').status).toBe(500);
  });
});
