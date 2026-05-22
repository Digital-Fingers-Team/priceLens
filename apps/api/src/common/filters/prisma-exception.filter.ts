// apps/api/src/common/filters/prisma-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';
    let code = 'DATABASE_ERROR';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique constraint violation
          status = HttpStatus.CONFLICT;
          message = `A record with this ${this.extractField(exception)} already exists`;
          code = 'DUPLICATE_RECORD';
          break;
        case 'P2025': // Record not found
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          code = 'NOT_FOUND';
          break;
        case 'P2003': // Foreign key constraint
          status = HttpStatus.BAD_REQUEST;
          message = 'Referenced record does not exist';
          code = 'INVALID_REFERENCE';
          break;
        case 'P2014': // Relation violation
          status = HttpStatus.BAD_REQUEST;
          message = 'Relation constraint violation';
          code = 'RELATION_VIOLATION';
          break;
        default:
          this.logger.error(`Unhandled Prisma error ${exception.code}:`, exception);
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid database query';
      code = 'QUERY_VALIDATION_ERROR';
      this.logger.error('Prisma validation error:', exception.message);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private extractField(err: Prisma.PrismaClientKnownRequestError): string {
    const target = err.meta?.target;
    if (Array.isArray(target)) return target.join(', ');
    return 'field';
  }
}