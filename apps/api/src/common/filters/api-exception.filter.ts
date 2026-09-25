import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ApiErrorBody, ApiErrorCode, ApiErrorResponse } from '../errors/api-error';

const STATUS_CODES: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Body keys Nest and our exceptions use for the envelope itself, not for details. */
const ENVELOPE_KEYS = new Set(['statusCode', 'error', 'message', 'code']);

interface Mapped {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Turns every error thrown while handling a request -- HTTP exceptions,
 * domain exceptions, Prisma errors, and anything else -- into the one
 * envelope the web app parses (ApiErrorResponse). Unknown errors become a
 * 500 that says nothing about the internals; the stack goes to the log.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const mapped = this.map(exception);
    const route = `${request.method} ${request.url}`;
    if (mapped.status >= 500) {
      this.logger.error(`${route} → ${mapped.status}: ${describe(exception)}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`${route} → ${mapped.status}: ${mapped.message}`);
    }

    const error: ApiErrorBody = {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details !== undefined ? { details: mapped.details } : {}),
      requestId: (request.headers['x-request-id'] as string) ?? uuidv4(),
      timestamp: new Date().toISOString(),
      path: request.url,
    };
    const body: ApiErrorResponse = { success: false, error };
    response.status(mapped.status).json(body);
  }

  map(exception: unknown): Mapped {
    if (exception instanceof HttpException) {
      return this.mapHttp(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaKnown(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: HttpStatus.BAD_REQUEST, code: 'QUERY_VALIDATION_ERROR', message: 'Invalid database query' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }

  private mapHttp(exception: HttpException): Mapped {
    const status = exception.getStatus();
    const fallbackCode = STATUS_CODES[status] ?? 'UNKNOWN_ERROR';
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { status, code: fallbackCode, message: body };
    }

    const fields = (body ?? {}) as Record<string, unknown>;
    const code = typeof fields.code === 'string' ? (fields.code as ApiErrorCode) : fallbackCode;

    // class-validator: message is the list of what to fix.
    if (Array.isArray(fields.message)) {
      return { status, code, message: 'Validation failed', details: fields.message };
    }

    const message = typeof fields.message === 'string' ? fields.message : exception.message;
    const extra = Object.fromEntries(Object.entries(fields).filter(([key]) => !ENVELOPE_KEYS.has(key)));
    return {
      status,
      code,
      message,
      ...(Object.keys(extra).length > 0 ? { details: extra } : {}),
    };
  }

  private mapPrismaKnown(exception: Prisma.PrismaClientKnownRequestError): Mapped {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const field = Array.isArray(target) ? target.join(', ') : 'field';
        return { status: HttpStatus.CONFLICT, code: 'DUPLICATE_RECORD', message: `A record with this ${field} already exists` };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Record not found' };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, code: 'INVALID_REFERENCE', message: 'Referenced record does not exist' };
      case 'P2014':
        return { status: HttpStatus.BAD_REQUEST, code: 'RELATION_VIOLATION', message: 'Relation constraint violation' };
      default:
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'DATABASE_ERROR', message: 'Database error' };
    }
  }
}

function describe(exception: unknown): string {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) return `Prisma ${exception.code}: ${exception.message}`;
  if (exception instanceof Error) return exception.message;
  return String(exception);
}
