import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import os from 'os';

@Controller()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

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
}
