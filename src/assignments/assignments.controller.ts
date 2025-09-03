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
  UploadedFile,
  Query,
  BadRequestException,
  UseInterceptors,
  Res,
  Header,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request, Express, Response } from 'express';
import type { AuthUser } from '../auth/auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('assignments')
@UseGuards(AuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly svc: AssignmentsService) {}

  // ✅ Crear asignación individual
  @Post()
  @Roles('SUPERADMIN', 'ADMIN')
  async assign(
    @Body() body: { userId: string; sirenId: string },
    @Req() req: Request,
  ) {
    const currentUser = req['user'] as AuthUser;
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    if (currentUser.roles.includes('ADMIN') && !currentUser.urbanizationId) {
      throw new ForbiddenException('Admin sin urbanización asignada');
    }

    return this.svc.assign(body.userId, body.sirenId, currentUser);
  }

  // ✅ Remover asignación individual
  @Delete(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  async unassign(@Param('id') id: string) {
    return this.svc.unassign(id);
  }

  // 🔎 Listar asignaciones por usuario
  @Get('user/:userId')
  @Roles('SUPERADMIN', 'ADMIN')
  async findByUser(@Param('userId') userId: string, @Req() req: Request) {
    const currentUser = req['user'] as AuthUser;
    if (!currentUser) throw new ForbiddenException('No authenticated user');
    return this.svc.findByUser(userId, currentUser);
  }

  // 🔎 Listar asignaciones por sirena
  @Get('siren/:sirenId')
  @Roles('SUPERADMIN', 'ADMIN')
  async findBySiren(@Param('sirenId') sirenId: string, @Req() req: Request) {
    const currentUser = req['user'] as AuthUser;
    if (!currentUser) throw new ForbiddenException('No authenticated user');
    return this.svc.findBySiren(sirenId, currentUser);
  }

  // 🚀 BULK IMPORT (Excel: userId|email|username, sirenId|deviceId, active)
  @Post('bulk/import')
  @Roles('SUPERADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportAssignments(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('dryRun') dryRun = 'true',
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const currentUser = req['user'] as AuthUser;
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    const isDry = String(dryRun).toLowerCase() !== 'false';
    return this.svc.bulkImportAssignments(file.buffer, currentUser, {
      dryRun: isDry,
    });
  }

  // 🚀 BULK DELETE (Excel: userId|email|username, sirenId|deviceId)
  @Post('bulk/delete')
  @Roles('SUPERADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async bulkDeleteAssignments(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const currentUser = req['user'] as AuthUser;
    if (!currentUser) throw new ForbiddenException('No authenticated user');

    return this.svc.bulkDeleteAssignments(file.buffer, currentUser);
  }

  // 📄 TEMPLATE (Excel de ejemplo para bulk)
  @Get('bulk/template')
  @Roles('SUPERADMIN', 'ADMIN')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="assignments_template.xlsx"',
  )
  async assignmentsTemplate(@Res() res: Response) {
    const buffer = await this.svc.buildAssignmentsTemplate();
    // Envío binario explícito (evita serialización JSON y asegura archivo válido)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="assignments_template.xlsx"',
    );
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }
}
