import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { DataModule } from 'src/data/data.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // --- INICIO CORRECCIÓN 1 y 2 ---
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
        const webhookUrl = configService.get<string>('TELEGRAM_WEBHOOK_URL');

        if (!token) {
          throw new Error(
            'TELEGRAM_BOT_TOKEN no está definido en las variables de entorno.',
          );
        }
        if (!webhookUrl) {
          throw new Error(
            'TELEGRAM_WEBHOOK_URL no está definido en las variables de entorno.',
          );
        }

        const domain = new URL(webhookUrl).origin;

        return {
          token, // Ahora es un string garantizado
          webhook: {
            domain: domain,
            path: '/api/telegram/webhook',
          },
        };
        // --- FIN CORRECCIÓN 1 y 2 ---
      },
    }),
    DataModule,
    UsersModule,
  ],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
