import { Module, forwardRef } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttController } from './mqtt.controller';
import { DevicesModule } from '../devices/devices.module';
import { DataModule } from '../data/data.module';
import { WsModule } from '../ws/ws.module'; // 👈 importar WsModule

@Module({
  imports: [
    DataModule,
    forwardRef(() => DevicesModule), // 🔹 dependencia circular
    WsModule, // 👈 habilita WsGateway en este módulo
  ],
  providers: [MqttService],
  controllers: [MqttController],
  exports: [MqttService],
})
export class MqttModule {}
