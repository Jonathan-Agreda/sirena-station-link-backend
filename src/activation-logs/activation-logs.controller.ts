import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ActivationLogsService } from './activation-logs.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request } from 'express';

@Controller('activation-logs')
@UseGuards(AuthGuard, RolesGuard)
export class ActivationLogsController {
  constructor(private readonly svc: ActivationLogsService) {}

  // 🔎 SUPERADMIN ve todos
  @Get()
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findAll(@Req() req: Request) {
    const user = req['user'];
    return this.svc.findAll(user);
  }

  // 🔎 Filtrar por sirena
  @Get('siren/:sirenId')
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findBySiren(@Param('sirenId') sirenId: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findBySiren(sirenId, user);
  }

  // 🔎 Filtrar por usuario
  @Get('user/:userId')
  @Roles('SUPERADMIN', 'ADMIN')
  findByUser(@Param('userId') userId: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findByUser(userId, user);
  }
}
