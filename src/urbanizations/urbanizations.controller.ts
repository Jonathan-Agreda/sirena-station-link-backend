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
import { UrbanizationsService } from './urbanizations.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Role } from '@prisma/client';
import type { Request } from 'express';

@Controller('urbanizations')
@UseGuards(AuthGuard, RolesGuard)
export class UrbanizationsController {
  constructor(private readonly svc: UrbanizationsService) {}

  // ✅ Solo SUPERADMIN puede crear urbanizaciones
  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body()
    body: {
      name: string;
      maxUsers?: number;
    },
  ) {
    return this.svc.create(body);
  }

  // ✅ SUPERADMIN ve todas; otros solo la suya
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findAll(@Req() req: Request) {
    const user = req['user']; // viene del token OIDC enriquecido
    return this.svc.findAll(user);
  }

  // ✅ SUPERADMIN puede ver cualquiera; otros solo la suya
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findOne(id, user);
  }

  // ✅ Solo SUPERADMIN puede actualizar
  @Put(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      maxUsers?: number;
    },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.update(id, body, user);
  }

  // ✅ Solo SUPERADMIN puede eliminar
  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.remove(id, user);
  }
}
