import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';

@Module({
  providers: [WsGateway],
  exports: [WsGateway], // 👈 hace disponible el gateway a otros módulos
})
export class WsModule {}
