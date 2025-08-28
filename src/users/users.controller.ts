import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  // SUPERADMIN → todos; ADMIN → solo su urbanización
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  findAll(@Req() req: Request) {
    const user = req['user'];
    return this.svc.findAll(user);
  }

  // SUPERADMIN puede ver cualquiera;
  // ADMIN solo usuarios de su urbanización;
  // GUARDIA/RESIDENTE solo su propio perfil
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findOne(id, user);
  }

  // SUPERADMIN → crear en cualquier urbanización
  // ADMIN → crear solo en su propia urbanización
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  create(
    @Body()
    body: {
      username: string;
      email: string;
      role: Role;
      urbanizationId?: string;
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.create(body, user);
  }

  // SUPERADMIN → actualizar cualquiera
  // ADMIN → actualizar solo dentro de su urbanización
  // (pero no puede tocar sessionLimit ni subir roles a ADMIN/SUPERADMIN)
  @Put(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      email: string;
      role: Role;
      etapa: string;
      manzana: string;
      villa: string;
      alicuota: boolean;
      urbanizationId: string;
      sessionLimit: number | null;
    }>,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.update(id, body, user);
  }

  // SUPERADMIN → borrar cualquiera
  // ADMIN → solo dentro de su urbanización
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.remove(id, user);
  }

  // 🔥 Listar sesiones activas de un usuario (solo SUPERADMIN/ADMIN)
  @Get(':id/sessions')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  listSessions(@Param('id') id: string) {
    return this.svc.listSessions(id);
  }

  // 🔥 Cerrar sesión remota (solo SUPERADMIN/ADMIN)
  @Delete(':id/sessions/:sessionId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  terminateSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.terminateSession(id, sessionId);
  }
}
