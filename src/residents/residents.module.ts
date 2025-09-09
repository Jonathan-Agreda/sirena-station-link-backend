import { Module } from '@nestjs/common';
import { ResidentsController } from './residents.controller';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [ResidentsController],
  providers: [PrismaService],
})
export class ResidentsModule {}
