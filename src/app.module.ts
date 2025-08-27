import { Module, forwardRef } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { DataModule } from './data/data.module';
import { AuthModule } from './auth/auth.module';
import { MqttModule } from './mqtt/mqtt.module';
import { DevicesModule } from './devices/devices.module';
import { WsModule } from './ws/ws.module'; // 👈 usar el nuevo módulo
import { UrbanizationsModule } from './urbanizations/urbanizations.module';
import { UsersModule } from './users/users.module';
import { SirensModule } from './sirens/sirens.module';
import { GroupsModule } from './groups/groups.module';
import { ActivationLogsModule } from './activation-logs/activation-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validate: validateEnv,
    }),
    DataModule,
    AuthModule,
    forwardRef(() => MqttModule),
    forwardRef(() => DevicesModule),
    WsModule,
    UrbanizationsModule,
    UsersModule,
    SirensModule,
    GroupsModule,
    ActivationLogsModule, // 👈 ya no se declara WsGateway aquí
  ],
  controllers: [AppController, HealthController],
  providers: [AppService], // 👈 quitamos WsGateway de aquí
})
export class AppModule {}
