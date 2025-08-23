// src/mqtt/mqtt.controller.ts
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { MqttService } from './mqtt.service';

@Controller('mqtt')
export class MqttController {
  constructor(private readonly mqtt: MqttService) {}

  @Get('health')
  health() {
    return {
      connected: this.mqtt.isConnected(),
      clientId: this.mqtt.getClientId(),
    };
  }

  @Get('state')
  allStates() {
    return { items: this.mqtt.getAllStates() };
  }

  @Get('state/:deviceId')
  byId(@Param('deviceId') deviceId: string) {
    const s = this.mqtt.getState(deviceId);
    if (!s) throw new NotFoundException('Device not found or no state yet');
    return s;
  }
}
