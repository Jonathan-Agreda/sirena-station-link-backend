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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      validate: validateEnv,
    }),
    DataModule,
    AuthModule,
    forwardRef(() => MqttModule), // 🔹 se protege la referencia circular
    forwardRef(() => DevicesModule),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
