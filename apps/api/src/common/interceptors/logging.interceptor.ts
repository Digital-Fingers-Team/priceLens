// apps/api/src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { requestIdOf } from '../request-id.middleware';
import { redactUrl } from '../redact-url';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, ip } = req;
    const url = redactUrl(req.url);
    const requestId = requestIdOf(req);

    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const duration = Date.now() - startTime;
        this.logger.log(
          `${method} ${url} ${res.statusCode} ${duration}ms [${requestId}] ${ip}`,
        );
      }),
      catchError((err) => {
        const duration = Date.now() - startTime;
        // A client error (unknown product, bad input, 401/403/429) is the
        // request's fault and expected; only a 5xx or an unknown error is ours.
        // With JSON logs (OPS-16) the level is what a log store counts.
        const status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
        const line = `${method} ${url} ${status} ${duration}ms [${requestId}] ${err.message}`;
        if (status >= 500) this.logger.error(line);
        else this.logger.warn(line);
        return throwError(() => err);
      }),
    );
  }
}