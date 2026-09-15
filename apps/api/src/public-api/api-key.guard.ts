import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeysService, ResolvedApiKey } from './api-keys.service';

export const API_SCOPES_KEY = 'api_scopes';

/** Declares which scope a public-API route needs. */
export const RequiresApiScope = (...scopes: string[]) =>
  Reflect.metadata(API_SCOPES_KEY, scopes);

export interface ApiKeyRequest extends Request {
  apiKey?: ResolvedApiKey;
}

/**
 * Authenticates enterprise API traffic.
 *
 * Applied per-controller rather than globally: these routes are the only ones
 * that accept a key instead of a JWT, and the rest of the app must keep
 * rejecting keys outright.
 *
 * Quota is enforced here, before the handler runs, and the counter is
 * incremented first so concurrent requests cannot all read the pre-call total
 * and exceed the limit together.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const presented = this.extractKey(request);

    if (!presented) {
      throw new UnauthorizedException(
        'Provide your API key as "Authorization: Bearer pl_live_..." or an X-API-Key header.',
      );
    }

    const resolved = await this.apiKeys.resolve(presented);
    // One message for every failure mode, so the endpoint cannot be used to
    // discover which keys exist.
    if (!resolved) throw new UnauthorizedException('Invalid or inactive API key');

    const required = this.reflector.getAllAndOverride<string[]>(API_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required?.length) {
      const missing = required.filter((scope) => !resolved.scopes.includes(scope));
      if (missing.length > 0) {
        throw new ForbiddenException(`This key is missing the "${missing[0]}" scope`);
      }
    }

    const endpoint = `${request.method} ${context.getClass().name}.${context.getHandler().name}`;
    const quota = await this.apiKeys.recordCall(
      resolved.apiKey.id,
      resolved.orgId,
      endpoint,
      resolved.dailyLimit,
    );

    const response = context.switchToHttp().getResponse();
    response.setHeader?.('X-RateLimit-Limit', String(quota.limit));
    response.setHeader?.('X-RateLimit-Remaining', String(Math.max(quota.limit - quota.used, 0)));

    if (!quota.allowed) {
      await this.apiKeys.recordError(resolved.apiKey.id, endpoint);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'QuotaExceeded',
          message: `Daily quota of ${quota.limit} calls exceeded. It resets at 00:00 UTC.`,
          used: quota.used,
          limit: quota.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    request.apiKey = resolved;
    return true;
  }

  private extractKey(request: ApiKeyRequest): string | null {
    const header = request.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7).trim();

    const apiKeyHeader = request.headers?.['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) return apiKeyHeader.trim();

    return null;
  }
}
