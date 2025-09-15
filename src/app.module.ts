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
import { WsModule } from './ws/ws.module';
import { UrbanizationsModule } from './urbanizations/urbanizations.module';
import { UsersModule } from './users/users.module';
import { SirensModule } from './sirens/sirens.module';
import { GroupsModule } from './groups/groups.module';
import { ActivationLogsModule } from './activation-logs/activation-logs.module';
import { AssignmentsModule } from './assignments/assignments.module'; // 👈 importar módulo
import { ResidentsModule } from './residents/residents.module';
import { MailModule } from './mail/mail.module';
import { TelegramModule } from './telegram/telegram.module';

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
    ActivationLogsModule,
    AssignmentsModule,
    ResidentsModule,
    MailModule,
    TelegramModule, // 👈 registrar aquí
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
