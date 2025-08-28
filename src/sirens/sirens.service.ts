import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';

type BulkOptions = { dryRun?: boolean };
function normalizeKey(s?: string) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

@Injectable()
export class SirensService {
  constructor(private prisma: PrismaService) {}

  // 🔎 Listar sirenas según el rol
  async findAll(user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.siren.findMany({
        include: { urbanization: true },
      });
    }

    if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.GUARDIA)) {
      if (!user.urbanizationId) {
        throw new ForbiddenException('No urbanization linked to user');
      }
      return this.prisma.siren.findMany({
        where: { urbanizationId: user.urbanizationId },
        include: { urbanization: true },
      });
    }

    if (user.roles.includes(Role.RESIDENTE)) {
      if (!user.userId) {
        throw new ForbiddenException('No local user linked to token');
      }
      return this.prisma.siren.findMany({
        where: {
          residents: {
            some: {
              userId: user.userId,
              active: true,
            },
          },
        },
        include: { urbanization: true },
      });
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🔎 Obtener sirena por ID
  async findOne(id: string, user: any) {
    const siren = await this.prisma.siren.findUnique({
      where: { id },
      include: { urbanization: true, residents: true },
    });
    if (!siren) throw new NotFoundException('Siren not found');

    if (user.roles.includes(Role.SUPERADMIN)) return siren;

    if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.GUARDIA)) {
      if (
        !user.urbanizationId ||
        siren.urbanizationId !== user.urbanizationId
      ) {
        throw new ForbiddenException('Access denied');
      }
      return siren;
    }

    if (user.roles.includes(Role.RESIDENTE)) {
      if (!user.userId) {
        throw new ForbiddenException('No local user linked to token');
      }
      const assigned = siren.residents.some(
        (a) => a.userId === user.userId && a.active,
      );
      if (!assigned) throw new ForbiddenException('Access denied');
      return siren;
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🛠 Crear sirena (solo SUPERADMIN)
  async create(data: {
    deviceId: string;
    apiKey: string;
    urbanizationId: string;
    lat?: number;
    lng?: number;
  }) {
    return this.prisma.siren.create({ data });
  }

  // 🛠 Editar sirena (solo SUPERADMIN)
  async update(
    id: string,
    data: Partial<{
      deviceId: string;
      apiKey: string;
      lat: number;
      lng: number;
      urbanizationId: string;
    }>,
  ) {
    const siren = await this.prisma.siren.findUnique({ where: { id } });
    if (!siren) throw new NotFoundException('Siren not found');
    return this.prisma.siren.update({ where: { id }, data });
  }

  // 🛠 Eliminar sirena (solo SUPERADMIN)
  async remove(id: string) {
    const siren = await this.prisma.siren.findUnique({ where: { id } });
    if (!siren) throw new NotFoundException('Siren not found');
    return this.prisma.siren.delete({ where: { id } });
  }

  // ========== 📦 Bulk Excel helpers ==========
  private async readSheet(buffer: Uint8Array | ArrayBuffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('Workbook has no sheets');

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col] = normalizeKey(String(cell.value ?? ''));
    });

    const rows: Record<string, any>[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (row.getCell(1).value == null) continue;
      const obj: Record<string, any> = {};
      for (let c = 1; c <= headerRow.cellCount; c++) {
        const key = headers[c];
        let val: any = row.getCell(c).value;
        if (typeof val === 'object' && val && 'text' in val) {
          val = (val as any).text;
        }
        obj[key] = val;
      }
      rows.push(obj);
    }
    return rows;
  }

  // 🚀 Bulk import sirens (acepta urbanizationId o urbanization name)
  async bulkImportSirens(buffer: Uint8Array | ArrayBuffer, opts: BulkOptions) {
    const { dryRun = true } = opts;
    const rows = await this.readSheet(buffer);

    let toCreate = 0,
      toUpdate = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const deviceId = String(raw['deviceid'] ?? '').trim();
      const apiKey = String(raw['apikey'] ?? '').trim();
      const urbIdFromFile = String(raw['urbanizationid'] ?? '').trim();
      const urbName = String(raw['urbanization'] ?? '').trim();
      const lat = raw['lat'] != null ? Number(raw['lat']) : null;
      const lng = raw['lng'] != null ? Number(raw['lng']) : null;

      if (!deviceId || !apiKey || (!urbIdFromFile && !urbName)) {
        report.push({
          deviceId,
          status: 'error',
          error:
            'deviceId, apiKey and urbanizationId|urbanization are required',
        });
        continue;
      }

      // 🔎 Resolver urbanizationId por id o nombre
      let urbanizationId: string | undefined;
      if (urbIdFromFile) {
        const exists = await this.prisma.urbanization.findUnique({
          where: { id: urbIdFromFile },
        });
        if (!exists) {
          report.push({
            deviceId,
            status: 'error',
            error: `urbanizationId not found: ${urbIdFromFile}`,
          });
          continue;
        }
        urbanizationId = urbIdFromFile;
      } else if (urbName) {
        const exists = await this.prisma.urbanization.findFirst({
          where: { name: urbName },
        });
        if (!exists) {
          report.push({
            deviceId,
            status: 'error',
            error: `urbanization name not found: ${urbName}`,
          });
          continue;
        }
        urbanizationId = exists.id;
      }

      if (!urbanizationId) {
        report.push({
          deviceId,
          status: 'error',
          error: 'urbanizationId or urbanization required',
        });
        continue;
      }

      const existing = await this.prisma.siren.findFirst({
        where: { deviceId },
      });

      if (!existing) {
        toCreate++;
        if (!dryRun) {
          await this.prisma.siren.create({
            data: { deviceId, apiKey, urbanizationId, lat, lng },
          });
        }
        report.push({
          deviceId,
          status: dryRun ? 'would_create' : 'created',
        });
      } else {
        toUpdate++;
        if (!dryRun) {
          await this.prisma.siren.update({
            where: { id: existing.id },
            data: { apiKey, urbanizationId, lat, lng },
          });
        }
        report.push({
          deviceId,
          status: dryRun ? 'would_update' : 'updated',
        });
      }
    }

    return { dryRun, toCreate, toUpdate, processed: rows.length, report };
  }

  // 🚀 Bulk delete sirens
  async bulkDeleteSirens(buffer: Uint8Array | ArrayBuffer) {
    const rows = await this.readSheet(buffer);

    let removed = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const deviceId = String(raw['deviceid'] ?? '').trim();
      if (!deviceId) {
        report.push({
          deviceId,
          status: 'error',
          error: 'deviceId is required',
        });
        continue;
      }

      const existing = await this.prisma.siren.findFirst({
        where: { deviceId },
      });
      if (!existing) {
        report.push({ deviceId, status: 'not_found' });
        continue;
      }

      await this.prisma.siren.delete({ where: { id: existing.id } });
      removed++;
      report.push({ deviceId, status: 'deleted' });
    }

    return { removed, processed: rows.length, report };
  }

  // 🚀 Template Excel
  async buildSirensTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('sirens');
    ws.addRow([
      'deviceId',
      'apiKey',
      'urbanizationId',
      'urbanization',
      'lat',
      'lng',
    ]);
    ws.addRow([
      'SRN-001',
      'srn-001-api-key',
      'urb-123',
      '',
      -2.170998,
      -79.922359,
    ]);
    ws.addRow([
      'SRN-002',
      'srn-002-api-key',
      '',
      'Mi Urbanización',
      -2.171,
      -79.9224,
    ]);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
}
