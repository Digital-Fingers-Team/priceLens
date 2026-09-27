import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { csrfMatches, usesCookieAuth } from '../../auth/auth-cookies';
import { AppException } from '../errors/app.exception';

export const SKIP_CSRF_KEY = 'skipCsrf';
/** For routes that never act on a cookie session (login, register). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF check for writes authenticated by the session cookies
 * (auth/auth-cookies.ts, D-17). Bearer-token requests and reads pass through:
 * a bearer header cannot be attached by another site, and reads change
 * nothing. Registered before JwtAuthGuard, so a forged write is refused
 * before any session lookup.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [context.getHandler(), context.getClass()]);
    if (skip || !usesCookieAuth(req) || csrfMatches(req)) return true;
    throw new AppException(403, 'CSRF_TOKEN_INVALID', 'Missing or invalid CSRF token; reload the page and try again');
  }
}
