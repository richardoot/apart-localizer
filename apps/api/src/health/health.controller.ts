import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { HealthService } from './health.service'
import type { HealthReport } from './health.service'

/**
 * The door an uptime monitor knocks on. Unauthenticated: the report says
 * nothing a stranger can use. 503 rather than 200 with `status: "error"`
 * in the body, because every monitor understands a status code.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Vivacité, base de données et PostGIS' })
  async check(
    @Res({ passthrough: true }) res: Response
  ): Promise<HealthReport> {
    const report = await this.health.check()
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE)
    return report
  }
}
