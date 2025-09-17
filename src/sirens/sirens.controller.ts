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
  UnauthorizedException,
} from '@nestjs/common';
import { SirensService } from './sirens.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request, Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';

@Controller('sirens')
@UseGuards(AuthGuard, RolesGuard)
export class SirensController {
  constructor(private readonly svc: SirensService) {}

  // ✅ SUPERADMIN → CRUD completo
  // ✅ ADMIN/GUARDIA → ver sirenas de su urbanización
  // ✅ RESIDENTE → ver sirenas asignadas
  @Get()
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findAll(@Req() req: Request) {
    const user = req['user'];
    if (!user) {
      throw new UnauthorizedException('No user in request');
    }

    // 👇 Convertimos roles y normalizamos valores nulos
    const mappedUser: {
      roles: Role[];
      urbanizationId?: string;
      userId?: string;
    } = {
      roles: (user.roles || []).map((r: string) => r as Role),
      urbanizationId: user.urbanizationId ?? undefined,
      userId: user.userId ?? undefined,
    };

    return this.svc.findAll(mappedUser);
  }

  @Get(':id')
  @Roles('SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'];
    if (!user) {
      throw new UnauthorizedException('No user in request');
    }

    const mappedUser: {
      roles: Role[];
      urbanizationId?: string;
      userId?: string;
    } = {
      roles: (user.roles || []).map((r: string) => r as Role),
      urbanizationId: user.urbanizationId ?? undefined,
      userId: user.userId ?? undefined,
    };

    return this.svc.findOne(id, mappedUser);
  }

  @Post()
  @Roles('SUPERADMIN')
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
  @Roles('SUPERADMIN')
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
  @Roles('SUPERADMIN')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // 🚀 BULK IMPORT (Excel: deviceId | apiKey | urbanizationId | lat | lng)
  @Post('bulk/import')
  @Roles('SUPERADMIN')
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
  @Roles('SUPERADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async bulkDeleteSirens(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Excel file is required (field "file")');
    }
    return this.svc.bulkDeleteSirens(file.buffer);
  }

  // 🚀 TEMPLATE (Excel ejemplo)
  @Get('bulk/template')
  @Roles('SUPERADMIN')
  async sirensTemplate(): Promise<StreamableFile> {
    const buf = await this.svc.buildSirensTemplate();
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="sirens_template.xlsx"',
    });
  }
}
