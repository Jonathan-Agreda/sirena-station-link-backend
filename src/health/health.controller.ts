import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import os from 'os';
import { PrismaService } from '../data/prisma.service';

@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'SirenaStationLink API',
      env: this.config.get('NODE_ENV'),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      host: os.hostname(),
    };
  }

  @Get('health/db')
  async healthDb() {
    try {
      // Simple ping
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch (e: any) {
      return { status: 'error', db: 'down', message: e?.message ?? String(e) };
    }
  }
}
