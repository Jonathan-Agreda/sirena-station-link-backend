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
} from '@nestjs/common';
import { SirensService } from './sirens.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request, Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('sirens')
@UseGuards(AuthGuard, RolesGuard)
export class SirensController {
  constructor(private readonly svc: SirensService) {}

  // ✅ SUPERADMIN → CRUD completo
  // ✅ ADMIN/GUARDIA → ver sirenas de su urbanización
  // ✅ RESIDENTE → ver sirenas asignadas
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findAll(@Req() req: Request) {
    const user = req['user'];
    return this.svc.findAll(user);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA, Role.RESIDENTE)
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findOne(id, user);
  }

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body()
    body: {
      deviceId: string;
      apiKey: string;
      urbanizationId: string;
      lat?: number;
      lng?: number;
    },
  ) {
    return this.svc.create(body);
  }

  @Put(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      deviceId: string;
      apiKey: string;
      lat: number;
      lng: number;
      urbanizationId: string;
    }>,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // 🚀 BULK IMPORT (Excel: deviceId | apiKey | urbanizationId | lat | lng)
  @Post('bulk/import')
  @Roles(Role.SUPERADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportSirens(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun = 'true',
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const isDry = String(dryRun).toLowerCase() !== 'false';
    return this.svc.bulkImportSirens(file.buffer, { dryRun: isDry });
  }

  // 🚀 BULK DELETE (Excel: deviceId)
  @Post('bulk/delete')
  @Roles(Role.SUPERADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async bulkDeleteSirens(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    return this.svc.bulkDeleteSirens(file.buffer);
  }

  // 🚀 TEMPLATE (Excel ejemplo)
  @Get('bulk/template')
  @Roles(Role.SUPERADMIN)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="sirens_template.xlsx"')
  async sirensTemplate() {
    return this.svc.buildSirensTemplate();
  }
}
