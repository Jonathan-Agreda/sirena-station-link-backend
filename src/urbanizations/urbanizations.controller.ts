// src/urbanizations/urbanizations.controller.ts
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
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { UrbanizationsService } from './urbanizations.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '../auth/auth.guard';
import type { Request, Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('urbanizations')
@UseGuards(AuthGuard, RolesGuard)
export class UrbanizationsController {
  constructor(private readonly svc: UrbanizationsService) {}

  // ✅ Solo SUPERADMIN puede crear urbanizaciones
  @Post()
  @Roles('SUPERADMIN')
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
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findAll(@Req() req: Request) {
    const user = req['user'];
    return this.svc.findAll(user);
  }

  // ✅ SUPERADMIN puede ver cualquiera; otros solo la suya
  @Get(':id')
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.findOne(id, user);
  }

  // ✅ Solo SUPERADMIN puede actualizar
  @Put(':id')
  @Roles('SUPERADMIN')
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
  @Roles('SUPERADMIN')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    return this.svc.remove(id, user);
  }

  // 🚀 BULK IMPORT (Excel con columnas: name | maxUsers)
  @Post('bulk/import')
  @Roles('SUPERADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportUrbanizations(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('dryRun') dryRun = 'true',
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const user = req['user'];
    const isDry = String(dryRun).toLowerCase() !== 'false';
    return this.svc.bulkImportUrbanizations(file.buffer, user, {
      dryRun: isDry,
    });
  }

  // 🚀 BULK DELETE (Excel con columna: name)
  @Post('bulk/delete')
  @Roles('SUPERADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async bulkDeleteUrbanizations(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    const user = req['user'];
    return this.svc.bulkDeleteUrbanizations(file.buffer, user);
  }

  // 🚀 TEMPLATE (descarga ejemplo .xlsx)
  @Get('bulk/template')
  @Roles('SUPERADMIN')
  async urbTemplate(): Promise<StreamableFile> {
    const buf = await this.svc.buildUrbanizationsTemplate();
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="urbanizations_template.xlsx"',
    });
  }
}
