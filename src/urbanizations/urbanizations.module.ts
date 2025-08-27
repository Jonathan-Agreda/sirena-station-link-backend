import { Module } from '@nestjs/common';
import { UrbanizationsService } from './urbanizations.service';
import { UrbanizationsController } from './urbanizations.controller';

@Module({
  providers: [UrbanizationsService],
  controllers: [UrbanizationsController]
})
export class UrbanizationsModule {}
