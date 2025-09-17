import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  UseFilters,
  Req,
  Get,
  ForbiddenException,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../mqtt/mqtt.service';
import { SendCommandDto } from './dto/send-command.dto';
import { CommandPayload } from '../mqtt/mqtt.types';
import { KeycloakGuard } from '../auth/keycloak.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DevicesService } from './devices.service';
import { ActivationLogService } from './activation-log.service';
import { ActivationAction, ActivationResult } from '@prisma/client';
import { DeviceCmdExceptionFilter } from './devices.exception-filter';
import type { Request } from 'express';
import { TelegramService } from '../telegram/telegram.service';

@Controller('devices')
@UseGuards(KeycloakGuard, RolesGuard)
export class DevicesController {
  constructor(
    private readonly mqtt: MqttService,
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly activationLog: ActivationLogService,
    private readonly telegramService: TelegramService,
  ) {}

  private genCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  @Post(':deviceId/cmd')
  @Roles('ADMIN', 'SUPERADMIN', 'GUARDIA', 'RESIDENTE')
  @UseFilters(DeviceCmdExceptionFilter)
  async sendCommand(
    @Param('deviceId') deviceId: string,
    @Body() dto: SendCommandDto,
    @Req() req: Request,
  ) {
    const kcUser: any = (req as any).user;

    try {
      await this.devicesService.validateAccess(kcUser, deviceId);

      const defaultTtl =
        this.config.get<number>('DEFAULT_CMD_TTL_MS') ?? 300_000;
      const effectiveTtl =
        dto.ttlMs === undefined || dto.ttlMs === 0 ? defaultTtl : dto.ttlMs;

      const userEmail =
        kcUser?.email ||
        kcUser?.preferred_username ||
        kcUser?.sub ||
        'anonymous';

      const payload: CommandPayload = {
        commandId: this.genCommandId(),
        action: dto.action,
        ttlMs: effectiveTtl,
        requestedBy: userEmail,
        cause: dto.cause ?? 'manual',
      };

      await this.mqtt.publishCommand(deviceId, payload);

      const siren = await this.devicesService.findByDeviceId(deviceId);
      if (!siren) {
        throw new NotFoundException(`Sirena ${deviceId} no encontrada`);
      }

      await this.activationLog.record({
        sirenId: siren.id,
        userId: kcUser.dbId ?? kcUser.sub,
        action: dto.action as ActivationAction,
        result: ActivationResult.ACCEPTED,
        reason: 'Command published to broker',
        ip: req.ip,
      });

      // --- ENVIAR NOTIFICACIÓN A TELEGRAM ---
      const urbanization = await this.devicesService.findUrbanizationById(
        siren.urbanizationId,
      );
      if (urbanization?.telegramGroupId) {
        // Obtener datos completos del usuario
        let user = kcUser;
        if (!user.firstName || !user.lastName || !user.username) {
          const dbUser = await this.devicesService.findUserByKeycloakId(
            kcUser.sub,
          );
          if (dbUser) user = dbUser;
        }
        const fullName = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(' ');
        const username = user.username ? `(@${user.username})` : '';
        const actionText =
          dto.action === 'ON' ? '🚨 <b>ACTIVADA</b>' : '✅ <b>DESACTIVADA</b>';
        const msg =
          `${dto.action === 'ON' ? '🚨' : '✅'} Sirena <b>${siren.deviceId}</b> ${actionText}
<b>Usuario:</b> ${fullName || username} ${username}`.trim();

        await this.telegramService.sendToGroup(
          urbanization.telegramGroupId,
          msg,
        );
      }

      return { message: `Comando enviado a ${deviceId}`, payload };
    } catch (err: any) {
      try {
        const siren = await this.devicesService.findByDeviceId(deviceId);

        let userId: string | null = null;
        if (kcUser?.dbId) {
          userId = kcUser.dbId;
        } else if (kcUser?.sub) {
          const dbUser = await this.devicesService.findUserByKeycloakId(
            kcUser.sub,
          );
          userId = dbUser?.id ?? null;
        }

        await this.activationLog.record({
          sirenId: siren?.id ?? deviceId,
          userId,
          action: dto.action as ActivationAction,
          result: ActivationResult.REJECTED,
          reason: err?.message ?? 'FORBIDDEN',
          ip: req.ip,
        });
      } catch {
        // ignorar errores de logging
      }
      throw err;
    }
  }

  @Get('ping')
  ping(@Req() req: Request) {
    const kcUser: any = (req as any).user;
    return { message: 'pong', user: kcUser || null };
  }

  @Get('logs')
  @Roles('ADMIN', 'SUPERADMIN')
  async getLogs(@Req() req: Request, @Query('userId') userId?: string) {
    const kcUser: any = (req as any).user;
    const roles: string[] = (kcUser.roles || []).map((r: string) =>
      r.toUpperCase(),
    );

    if (roles.includes('SUPERADMIN')) {
      return this.activationLog.findAll({ userId });
    }

    if (roles.includes('ADMIN')) {
      const dbUser = await this.devicesService.findUserByKeycloakId(kcUser.sub);
      if (!dbUser?.urbanizationId) {
        throw new ForbiddenException(
          'El admin no tiene urbanización asociada en BD',
        );
      }

      if (userId) {
        return this.activationLog.findByUrbanizationAndUser(
          dbUser.urbanizationId,
          userId,
        );
      }
      return this.activationLog.findByUrbanization(dbUser.urbanizationId);
    }

    throw new ForbiddenException('No autorizado para ver logs');
  }

  @Get(':deviceId/logs')
  @Roles('ADMIN', 'SUPERADMIN')
  async getLogsByDevice(
    @Param('deviceId') deviceId: string,
    @Req() req: Request,
    @Query('userId') userId?: string,
  ) {
    const kcUser: any = (req as any).user;
    const roles: string[] = (kcUser.roles || []).map((r: string) =>
      r.toUpperCase(),
    );

    const siren = await this.devicesService.findByDeviceId(deviceId);
    if (!siren) {
      throw new NotFoundException(`Sirena ${deviceId} no encontrada`);
    }

    if (roles.includes('SUPERADMIN')) {
      if (userId) {
        return this.activationLog.findBySirenAndUser(siren.id, userId);
      }
      return this.activationLog.findBySiren(siren.id);
    }

    if (roles.includes('ADMIN')) {
      const dbUser = await this.devicesService.findUserByKeycloakId(kcUser.sub);
      if (!dbUser?.urbanizationId) {
        throw new ForbiddenException(
          'El admin no tiene urbanización asociada en BD',
        );
      }

      if (userId) {
        return this.activationLog.findBySirenAndUrbanizationAndUser(
          siren.id,
          dbUser.urbanizationId,
          userId,
        );
      }
      return this.activationLog.findBySirenAndUrbanization(
        siren.id,
        dbUser.urbanizationId,
      );
    }

    throw new ForbiddenException('No autorizado para ver logs');
  }
}
