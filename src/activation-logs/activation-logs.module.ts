import { Module } from '@nestjs/common';
import { ActivationLogsController } from './activation-logs.controller';
import { ActivationLogsService } from './activation-logs.service';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ActivationLogsController],
  providers: [ActivationLogsService, PrismaService],
  exports: [ActivationLogsService],
})
export class ActivationLogsModule {}
