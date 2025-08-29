import { Module } from '@nestjs/common';
import { ResidentsController } from './residents.controller';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ResidentsController],
  providers: [PrismaService],
})
export class ResidentsModule {}
