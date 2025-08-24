import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  Req,
  Get,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../mqtt/mqtt.service';
import { SendCommandDto } from './dto/send-command.dto';
import { CommandPayload } from '../mqtt/mqtt.types';
import { KeycloakGuard } from '../auth/keycloak.guard';
import type { Request } from 'express';

@Controller('devices')
@UseGuards(KeycloakGuard)
export class DevicesController {
  constructor(
    private readonly mqtt: MqttService,
    private readonly config: ConfigService,
  ) {}

  private genCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  /**
   * Enviar un comando a un dispositivo
   * POST /api/devices/:deviceId/cmd
   */
  @Post(':deviceId/cmd')
  async sendCommand(
    @Param('deviceId') deviceId: string,
    @Body() dto: SendCommandDto,
    @Req() req: Request,
  ) {
    const defaultTtl = this.config.get<number>('DEFAULT_CMD_TTL_MS') ?? 300_000; // fallback 5min

    const effectiveTtl =
      dto.ttlMs === undefined || dto.ttlMs === 0 ? defaultTtl : dto.ttlMs;

    const kcUser: any = (req as any).user; // viene del KeycloakGuard
    const userEmail =
      kcUser?.email || kcUser?.preferred_username || kcUser?.sub || 'anonymous';

    const payload: CommandPayload = {
      commandId: this.genCommandId(),
      action: dto.action,
      ttlMs: effectiveTtl,
      requestedBy: userEmail,
      cause: dto.cause ?? 'manual',
    };

    await this.mqtt.publishCommand(deviceId, payload);
    return { message: `Comando enviado a ${deviceId}`, payload };
  }

  /**
   * Endpoint de prueba
   * GET /api/devices/ping
   */
  @Get('ping')
  ping(@Req() req: Request) {
    const kcUser: any = (req as any).user;
    return {
      message: 'pong',
      user: kcUser || null,
    };
  }
}
