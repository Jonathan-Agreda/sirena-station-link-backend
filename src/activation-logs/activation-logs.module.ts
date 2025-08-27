import { Module } from '@nestjs/common';
import { ActivationLogsService } from './activation-logs.service';
import { ActivationLogsController } from './activation-logs.controller';

@Module({
  providers: [ActivationLogsService],
  controllers: [ActivationLogsController]
})
export class ActivationLogsModule {}
