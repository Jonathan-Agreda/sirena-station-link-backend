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
  UploadedFile,
  Query,
  BadRequestException,
  Header,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '../auth/auth.guard';
import type { Request, Express, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

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

      // nuevos
      firstName?: string | null;
      lastName?: string | null;
      cedula?: string | null;
      etapa?: string | null;
      manzana?: string | null;
      villa?: string | null;

      alicuota?: boolean;
    },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.create(body, user);
  }

  // SUPERADMIN → actualizar cualquiera
  // ADMIN → actualizar solo dentro de su urbanización
  // (no puede tocar sessionLimit ni subir a ADMIN/SUPERADMIN)
  @Put(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      email: string;
      username: string;
      role: Role;

      // nuevos
      firstName: string | null;
      lastName: string | null;
      cedula: string | null;
      etapa: string | null;
      manzana: string | null;
      villa: string | null;

      alicuota: boolean;
      urbanizationId: string;
      // sessionLimit se maneja en endpoint dedicado
    }>,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.update(id, body, user);
  }

  // 🔒 Solo SUPERADMIN puede cambiar sessionLimit
  @Put(':id/session-limit')
  @Roles(Role.SUPERADMIN)
  updateSessionLimit(
    @Param('id') id: string,
    @Body() body: { sessionLimit: number | null },
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.svc.update(id, { sessionLimit: body.sessionLimit }, user);
  }

  // SUPERADMIN → borrar cualquiera
  // ADMIN → solo dentro de su urbanización
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.remove(id, user);
  }

  // 🔥 Listar sesiones activas de un usuario (SUPERADMIN/ADMIN)
  @Get(':id/sessions')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  listSessions(@Param('id') id: string) {
    return this.svc.listSessions(id);
  }

  // 🔥 Cerrar sesión remota (SUPERADMIN/ADMIN)
  @Delete(':id/sessions/:sessionId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  terminateSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.terminateSession(id, sessionId);
  }

  // 🚀 BULK IMPORT USERS
  @Post('bulk/import')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportUsers(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('dryRun') dryRun = 'true',
    @Query('provisionKeycloak') provisionKeycloak = 'true',
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const user = req['user'];
    const isDry = String(dryRun).toLowerCase() !== 'false';
    const doKc = String(provisionKeycloak).toLowerCase() !== 'false';
    return this.svc.bulkImportUsers(file.buffer, user, {
      dryRun: isDry,
      provisionKeycloak: doKc,
    });
  }

  // 🚀 BULK DELETE USERS (POST para subir archivo)
  @Post('bulk/delete')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async bulkDeleteUsers(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const user = req['user'];
    return this.svc.bulkDeleteUsers(file.buffer, user);
  }

  // 📄 TEMPLATE USERS (envío binario explícito para evitar corrupción)
  @Get('bulk/template')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="users_template.xlsx"')
  async usersTemplate(@Res() res: Response) {
    const buffer = await this.svc.buildUsersTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="users_template.xlsx"',
    );
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }
}
