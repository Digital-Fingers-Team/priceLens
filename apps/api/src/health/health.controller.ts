import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { AppException } from '../common/errors/app.exception';
import { HealthService } from './health.service';

/**
 * Served outside the /api/v1 prefix (see configureApp), so the container
 * healthcheck and the proxy can reach it at a fixed path.
 */
@ApiTags('health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up and serving HTTP. Checks no dependency on purpose. */
  @Get()
  @ApiOperation({ summary: 'Liveness: the process answers HTTP' })
  live() {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and both Redis connections answer. 503 with per-dependency detail otherwise. */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness: Postgres, cache Redis and queue Redis all answer' })
  async ready() {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      throw new AppException(503, 'SERVICE_UNAVAILABLE', 'A dependency is unavailable', { checks: report.checks });
    }
    return report;
  }
}
