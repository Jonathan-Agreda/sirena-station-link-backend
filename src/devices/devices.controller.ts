import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { MqttService } from '../mqtt/mqtt.service';
import { SendCommandDto } from './dto/send-command.dto';
import { CommandPayload } from '../mqtt/mqtt.types';

@Controller('devices')
export class DevicesController {
  constructor(private readonly mqtt: MqttService) {}

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
    // por ahora, tomamos el usuario desde un header (luego será Keycloak)
    @Headers('x-user') xUser?: string,
  ) {
    const payload: CommandPayload = {
      commandId: this.genCommandId(),
      action: dto.action,
      ttlMs: dto.ttlMs ?? 300_000, // ⏱ default 5 min
      requestedBy: xUser?.toString() || 'anonymous', // en Fase 4.3 vendrá del token
      cause: dto.cause ?? 'manual',
    };

    await this.mqtt.publishCommand(deviceId, payload);
    return { message: `Comando enviado a ${deviceId}`, payload };
  }
}
