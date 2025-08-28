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
import { UrbanizationsService } from './urbanizations.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Role } from '@prisma/client';
import type { Request, Express } from 'express'; // ✅ usar `import type` por isolatedModules
import { FileInterceptor } from '@nestjs/platform-express';

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
    const user = req['user'];
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

  // 🚀 BULK IMPORT (Excel con columnas: name | maxUsers)
  @Post('bulk/import')
  @Roles(Role.SUPERADMIN)
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
  @Roles(Role.SUPERADMIN)
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
  @Roles(Role.SUPERADMIN)
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="urbanizations_template.xlsx"',
  )
  async urbTemplate() {
    return this.svc.buildUrbanizationsTemplate();
  }
}
