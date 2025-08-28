import { Module } from '@nestjs/common';
import { UrbanizationsController } from './urbanizations.controller';
import { UrbanizationsService } from './urbanizations.service';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module'; // 👈 importa el módulo de auth

@Module({
  imports: [AuthModule], // 👈 acceso a AuthGuard, RolesGuard y OidcService
  controllers: [UrbanizationsController],
  providers: [UrbanizationsService, PrismaService],
  exports: [UrbanizationsService],
})
export class UrbanizationsModule {}
