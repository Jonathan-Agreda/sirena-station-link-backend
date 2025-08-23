import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../mqtt/mqtt.service';
import { SendCommandDto } from './dto/send-command.dto';
import { CommandPayload } from '../mqtt/mqtt.types';

@Controller('devices')
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
    @Headers('x-user') xUser?: string,
  ) {
    const defaultTtl = this.config.get<number>('DEFAULT_CMD_TTL_MS') ?? 300_000; // fallback 5min

    // si no viene ttlMs o viene como 0, usamos el default
    const effectiveTtl =
      dto.ttlMs === undefined || dto.ttlMs === 0 ? defaultTtl : dto.ttlMs;

    const payload: CommandPayload = {
      commandId: this.genCommandId(),
      action: dto.action,
      ttlMs: effectiveTtl,
      requestedBy: xUser?.toString() || 'anonymous',
      cause: dto.cause ?? 'manual',
    };

    await this.mqtt.publishCommand(deviceId, payload);
    return { message: `Comando enviado a ${deviceId}`, payload };
  }
}
