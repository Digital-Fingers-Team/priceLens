// apps/api/src/database/prisma.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const isProduction = configService.get('app.isProduction', false);

    super({
      log: isProduction
        ? [
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ]
        : [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ],
    });

    // Log slow queries
    (this as any).$on('query', (e: Prisma.QueryEvent) => {
      if (e.duration > 500) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query.slice(0, 200)}`);
      } else if (!isProduction) {
        this.logger.debug(`Query (${e.duration}ms)`);
      }
    });

    (this as any).$on('error', (e: Prisma.LogEvent) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });

    (this as any).$on('warn', (e: Prisma.LogEvent) => {
      this.logger.warn(`Prisma warning: ${e.message}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Execute multiple operations in a transaction with automatic retry
   * on serialization failures (deadlocks).
   */
  async withRetryTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(fn as any, {
          maxWait: 5000,
          timeout: 30000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        });
      } catch (err) {
        const isRetryable =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2028'].includes(err.code); // serialization / timeout errors

        if (isRetryable && attempt < maxRetries) {
          this.logger.warn(`Transaction retry ${attempt}/${maxRetries}`);
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Transaction failed after max retries');
  }

  /**
   * Soft-delete pattern: set deletedAt instead of removing the row.
   */
  async softDelete(model: string, id: string): Promise<void> {
    await (this as any)[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}