import { Module } from '@nestjs/common';
import { SirensService } from './sirens.service';
import { SirensController } from './sirens.controller';

@Module({
  providers: [SirensService],
  controllers: [SirensController]
})
export class SirensModule {}
