import { Module } from '@nestjs/common';
import { ActivationLogsController } from './activation-logs.controller';
import { ActivationLogsService } from './activation-logs.service';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { ActivationLogsEnrichedController } from './activation-logs.enriched.controller';
import { ActivationLogsEnrichedService } from './activation-logs.enriched.service';

@Module({
  imports: [AuthModule],
  controllers: [ActivationLogsController, ActivationLogsEnrichedController],
  providers: [
    ActivationLogsService,
    PrismaService,
    ActivationLogsEnrichedService,
  ],
  exports: [ActivationLogsService],
})
export class ActivationLogsModule {}
