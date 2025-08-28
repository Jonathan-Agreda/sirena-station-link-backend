import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request } from 'express';

@Controller('groups')
@UseGuards(AuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly svc: GroupsService) {}

  // 🔎 Listar grupos
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findAll(@Req() req: Request) {
    const user = req['user'];
    return this.svc.findAll(user);
  }

  // 🔎 Obtener un grupo por ID
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findOne(id, user);
  }

  // 🛠 Crear grupo
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  create(
    @Body() body: { name: string; urbanizationId: string },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.create(body, user);
  }

  // 🛠 Editar grupo
  @Put(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() body: { name?: string },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.update(id, body, user);
  }

  // 🗑 Eliminar grupo
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.remove(id, user);
  }

  // 📋 Listar sirenas de un grupo
  @Get(':id/sirens')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  listSirens(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.listSirens(id, user);
  }

  // ➕ Mover sirena a un grupo
  @Put(':groupId/sirens/:sirenId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  addSirenToGroup(
    @Param('groupId') groupId: string,
    @Param('sirenId') sirenId: string,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.addSirenToGroup(groupId, sirenId, user);
  }

  // ➖ Quitar sirena de un grupo
  @Delete('sirens/:sirenId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  removeSirenFromGroup(@Param('sirenId') sirenId: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.removeSirenFromGroup(sirenId, user);
  }
}
