import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { TemplateRenderer } from './template/renderer';
import { MailDevController } from './mailDev.controller';

@Module({
  imports: [ConfigModule],
  providers: [MailService, TemplateRenderer],
  controllers: [MailDevController], // solo útil en dev si MAIL_DEV_ENABLED=true
  exports: [MailService],
})
export class MailModule {}
