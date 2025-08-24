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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DevicesService } from './devices.service';
import type { Request } from 'express';

@Controller('devices')
@UseGuards(KeycloakGuard, RolesGuard)
export class DevicesController {
  constructor(
    private readonly mqtt: MqttService,
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
  ) {}

  private genCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  /**
   * Enviar un comando a un dispositivo
   * Roles permitidos: ADMIN, SUPERADMIN, GUARDIA, RESIDENTE
   * POST /api/devices/:deviceId/cmd
   */
  @Post(':deviceId/cmd')
  @Roles('ADMIN', 'SUPERADMIN', 'GUARDIA', 'RESIDENTE')
  async sendCommand(
    @Param('deviceId') deviceId: string,
    @Body() dto: SendCommandDto,
    @Req() req: Request,
  ) {
    const kcUser: any = (req as any).user;

    // 🔹 Validar acceso según reglas de rol y urbanización/asignaciones
    await this.devicesService.validateAccess(kcUser, deviceId);

    const defaultTtl = this.config.get<number>('DEFAULT_CMD_TTL_MS') ?? 300_000;
    const effectiveTtl =
      dto.ttlMs === undefined || dto.ttlMs === 0 ? defaultTtl : dto.ttlMs;

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
   * Cualquier usuario autenticado (con token válido) puede acceder
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
