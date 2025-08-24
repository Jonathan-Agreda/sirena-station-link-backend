import { Module, forwardRef } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttController } from './mqtt.controller';
import { DevicesModule } from '../devices/devices.module';
import { DataModule } from '../data/data.module';

@Module({
  imports: [
    DataModule,
    forwardRef(() => DevicesModule), // 🔹 para romper dependencia circular
  ],
  providers: [MqttService],
  controllers: [MqttController],
  exports: [MqttService],
})
export class MqttModule {}
