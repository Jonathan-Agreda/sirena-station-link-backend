import { Module } from '@nestjs/common';
import { SirensService } from './sirens.service';
import { SirensController } from './sirens.controller';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module'; // ✅ para usar AuthGuard, RolesGuard, etc.

@Module({
  imports: [AuthModule], // <-- Importamos AuthModule
  providers: [SirensService, PrismaService],
  controllers: [SirensController],
})
export class SirensModule {}
