import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      username: string; // 👈 obligatorio en alta
      email: string;
      role: Role;
      urbanizationId?: string;
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    },
  ) {
    return this.svc.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      email: string; // ✅ solo email editable en Keycloak
      role: Role; // ✅ role editable en Keycloak
      etapa: string; // ✅ campos locales
      manzana: string;
      villa: string;
      alicuota: boolean;
      urbanizationId: string;
      sessionLimit: number | null;
    }>,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // 🔥 Listar sesiones activas de un usuario
  @Get(':id/sessions')
  listSessions(@Param('id') id: string) {
    return this.svc.listSessions(id);
  }

  // 🔥 Cerrar sesión remota
  @Delete(':id/sessions/:sessionId')
  terminateSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.terminateSession(id, sessionId);
  }
}
