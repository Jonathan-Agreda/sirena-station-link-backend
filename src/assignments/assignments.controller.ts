import {
  Controller,
  Post,
  Body,
  Delete,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
  Get,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request } from 'express';

@Controller('assignments')
@UseGuards(AuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly svc: AssignmentsService) {}

  // SUPERADMIN y ADMIN pueden asignar
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async assign(
    @Body() body: { userId: string; sirenId: string },
    @Req() req: Request,
  ) {
    const currentUser = req['user'];
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    if (currentUser.roles.includes(Role.ADMIN) && !currentUser.urbanizationId) {
      throw new ForbiddenException('Admin sin urbanización asignada');
    }

    return this.svc.assign(body.userId, body.sirenId, currentUser);
  }

  // SUPERADMIN y ADMIN pueden remover asignaciones
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async unassign(@Param('id') id: string) {
    return this.svc.unassign(id);
  }

  // 🔎 Listar asignaciones por usuario
  @Get('user/:userId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findByUser(@Param('userId') userId: string, @Req() req: Request) {
    const currentUser = req['user'];
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    return this.svc.findByUser(userId, currentUser);
  }

  // 🔎 Listar asignaciones por sirena
  @Get('siren/:sirenId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findBySiren(@Param('sirenId') sirenId: string, @Req() req: Request) {
    const currentUser = req['user'];
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    return this.svc.findBySiren(sirenId, currentUser);
  }
}
