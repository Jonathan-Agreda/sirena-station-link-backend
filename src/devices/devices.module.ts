import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [MqttModule],
  controllers: [DevicesController],
})
export class DevicesModule {}
