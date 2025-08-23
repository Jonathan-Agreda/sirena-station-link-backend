// src/mqtt/mqtt.module.ts
import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttController } from './mqtt.controller';

@Module({
  providers: [MqttService],
  controllers: [MqttController],
  exports: [MqttService],
})
export class MqttModule {}
