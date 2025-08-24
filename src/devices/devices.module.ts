import { Module, forwardRef } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { MqttModule } from '../mqtt/mqtt.module';
import { DataModule } from '../data/data.module';
import { ActivationLogService } from './activation-log.service';
import { DeviceCmdExceptionFilter } from './devices.exception-filter';

@Module({
  imports: [
    DataModule,
    forwardRef(() => MqttModule), // 🔹 referencia circular
  ],
  controllers: [DevicesController],
  providers: [DevicesService, ActivationLogService, DeviceCmdExceptionFilter],
  exports: [DevicesService, ActivationLogService],
})
export class DevicesModule {}
