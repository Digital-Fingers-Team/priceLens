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
        this.logger.error(
          `${method} ${url} ERROR ${duration}ms [${requestId}] ${err.message}`,
        );
        return throwError(() => err);
      }),
    );
  }
}