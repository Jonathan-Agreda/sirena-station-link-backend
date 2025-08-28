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
export class UrbanizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      // SUPERADMIN → todas
      return this.prisma.urbanization.findMany();
    }
    // ADMIN/GUARDIA/RESIDENTE → solo su urbanización
    if (!user.urbanizationId) {
      throw new ForbiddenException('No urbanization linked to user');
    }
    return this.prisma.urbanization.findMany({
      where: { id: user.urbanizationId },
    });
  }

  async findOne(id: string, user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.urbanization.findUnique({ where: { id } });
    }
    // ADMIN/GUARDIA/RESIDENTE → siempre la suya (ignorar id en la URL)
    if (!user.urbanizationId) {
      throw new ForbiddenException('No urbanization linked to user');
    }
    return this.prisma.urbanization.findUnique({
      where: { id: user.urbanizationId },
    });
  }

  async create(data: { name: string; maxUsers?: number }) {
    return this.prisma.urbanization.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; maxUsers?: number },
    user: any,
  ) {
    if (!user.roles.includes(Role.SUPERADMIN) && data.maxUsers !== undefined) {
      // ⚠️ Solo SUPERADMIN puede modificar maxUsers
      throw new ForbiddenException('Only SUPERADMIN can modify maxUsers');
    }
    if (!user.roles.includes(Role.SUPERADMIN)) {
      // ⚠️ Solo SUPERADMIN puede actualizar urbanizaciones en general
      throw new ForbiddenException('Only SUPERADMIN can update urbanizations');
    }
    return this.prisma.urbanization.update({ where: { id }, data });
  }

  async remove(id: string, user: any) {
    if (!user.roles.includes(Role.SUPERADMIN)) {
      throw new ForbiddenException('Only SUPERADMIN can delete urbanizations');
    }
    const urb = await this.prisma.urbanization.findUnique({ where: { id } });
    if (!urb) throw new NotFoundException('Urbanization not found');
    return this.prisma.urbanization.delete({ where: { id } });
  }

  // ========== 📦 Bulk Excel helpers ==========
  private async readSheet(buffer: Uint8Array | ArrayBuffer) {
    const wb = new ExcelJS.Workbook();
    // ExcelJS acepta Buffer/ArrayBuffer; evitamos choque de tipos con TS usando Uint8Array/ArrayBuffer
    await wb.xlsx.load(buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('Workbook has no sheets');

    // Encabezados normalizados
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col] = normalizeKey(String(cell.value ?? ''));
    });

    const rows: Record<string, any>[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (row.getCell(1).value == null) continue; // fila vacía
      const obj: Record<string, any> = {};
      for (let c = 1; c <= headerRow.cellCount; c++) {
        const key = headers[c];
        let val: any = row.getCell(c).value;
        if (typeof val === 'object' && val && 'text' in val)
          val = (val as any).text;
        obj[key] = val;
      }
      rows.push(obj);
    }
    return rows;
  }

  // 🚀 Bulk import (name | maxUsers)
  async bulkImportUrbanizations(
    buffer: Uint8Array | ArrayBuffer,
    user: any,
    opts: BulkOptions = {},
  ) {
    if (!user.roles.includes(Role.SUPERADMIN)) {
      throw new ForbiddenException('Only SUPERADMIN can import');
    }
    const { dryRun = true } = opts;
    const rows = await this.readSheet(buffer);

    let toCreate = 0,
      toUpdate = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const name = String(raw['name'] ?? '').trim();
      const maxUsers = raw['maxusers'] != null ? Number(raw['maxusers']) : null;
      if (!name) {
        report.push({ name, status: 'error', error: 'name is required' });
        continue;
      }

      const existing = await this.prisma.urbanization.findFirst({
        where: { name },
      });
      if (!existing) {
        toCreate++;
        if (!dryRun) {
          await this.prisma.urbanization.create({ data: { name, maxUsers } });
        }
        report.push({ name, status: dryRun ? 'would_create' : 'created' });
      } else {
        toUpdate++;
        if (!dryRun) {
          await this.prisma.urbanization.update({
            where: { id: existing.id },
            data: { maxUsers },
          });
        }
        report.push({ name, status: dryRun ? 'would_update' : 'updated' });
      }
    }

    return { dryRun, toCreate, toUpdate, processed: rows.length, report };
  }

  // 🚀 Bulk delete (name)
  async bulkDeleteUrbanizations(buffer: Uint8Array | ArrayBuffer, user: any) {
    if (!user.roles.includes(Role.SUPERADMIN)) {
      throw new ForbiddenException('Only SUPERADMIN can delete');
    }
    const rows = await this.readSheet(buffer);

    let removed = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const name = String(raw['name'] ?? '').trim();
      if (!name) {
        report.push({ name, status: 'error', error: 'name is required' });
        continue;
      }

      const existing = await this.prisma.urbanization.findFirst({
        where: { name },
      });
      if (!existing) {
        report.push({ name, status: 'not_found' });
        continue;
      }

      await this.prisma.urbanization.delete({ where: { id: existing.id } });
      removed++;
      report.push({ name, status: 'deleted' });
    }

    return { removed, processed: rows.length, report };
  }

  // 🚀 Template Excel
  async buildUrbanizationsTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('urbanizations');
    ws.addRow(['name', 'maxUsers']);
    ws.addRow(['Mi Urbanización', 200]);
    const buf = await wb.xlsx.writeBuffer(); // Uint8Array | ArrayBuffer según versión
    return Buffer.from(buf as ArrayBuffer); // ✅ convertir a Buffer para Nest
  }
}
