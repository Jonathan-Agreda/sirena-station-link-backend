import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role, type User, type Siren } from '@prisma/client';
import type { AuthUser } from '../auth/auth.guard';
import * as ExcelJS from 'exceljs';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

type BulkOptions = { dryRun?: boolean };

function normalizeKey(s?: string) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

function parseBoolean(v: unknown, fallback = true): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'verdadero', 'sí', 'si', 'y', 'yes'].includes(s))
    return true;
  if (['0', 'false', 'falso', 'no', 'n'].includes(s)) return false;
  return fallback;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  // ✅ Crear asignación (individual)
  async assign(userId: string, sirenId: string, currentUser: AuthUser) {
    if (currentUser.roles.includes(Role.ADMIN)) {
      if (!currentUser.urbanizationId) {
        throw new ForbiddenException('Admin sin urbanización asignada');
      }

      const [siren, user] = await Promise.all([
        this.prisma.siren.findUnique({ where: { id: sirenId } }),
        this.prisma.user.findUnique({ where: { id: userId } }),
      ]);

      if (!siren || siren.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes asignar sirenas de otra urbanización',
        );
      }

      if (!user || user.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes asignar usuarios de otra urbanización',
        );
      }
    }

    const newAssignment = await this.prisma.assignment.create({
      data: { userId, sirenId, active: true },
      include: { user: true, siren: true },
    });

    // Notificar al usuario por correo
    if (newAssignment.user.email) {
      const appUrl =
        this.config.get('APP_LOGIN_URL') ||
        'https://sirenastationlink.disxor.com';
      await this.mailService.sendSirenAssignedEmail({
        to: newAssignment.user.email,
        name:
          `${newAssignment.user.firstName ?? ''} ${
            newAssignment.user.lastName ?? ''
          }`.trim() ||
          newAssignment.user.username ||
          '',
        deviceId: newAssignment.siren.deviceId,
        appUrl,
      });
    }

    return newAssignment;
  }

  // ✅ Quitar asignación
  async unassign(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.prisma.assignment.delete({ where: { id } });
  }

  // 🔎 Listar por usuario
  async findByUser(userId: string, currentUser: AuthUser) {
    if (currentUser.roles.includes(Role.ADMIN)) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes ver asignaciones de otra urbanización',
        );
      }
    }

    return this.prisma.assignment.findMany({
      where: { userId, active: true },
      include: { siren: true },
    });
  }

  // 🔎 Listar por sirena
  async findBySiren(sirenId: string, currentUser: AuthUser) {
    if (currentUser.roles.includes(Role.ADMIN)) {
      const siren = await this.prisma.siren.findUnique({
        where: { id: sirenId },
      });
      if (!siren || siren.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes ver asignaciones de otra urbanización',
        );
      }
    }

    return this.prisma.assignment.findMany({
      where: { sirenId, active: true },
      include: { user: true },
    });
  }

  /**
   * Listar todas las asignaciones activas de una urbanización.
   * Incluye datos de usuario y sirena.
   */
  async findByUrbanization(urbanizationId: string, currentUser: AuthUser) {
    const isSuperAdmin = currentUser.roles.includes(Role.SUPERADMIN);
    const isAdmin = currentUser.roles.includes(Role.ADMIN);

    if (!isSuperAdmin && !isAdmin) {
      throw new ForbiddenException('No autorizado');
    }

    if (isAdmin && currentUser.urbanizationId !== urbanizationId) {
      throw new ForbiddenException('Solo puedes ver tu urbanización');
    }

    return this.prisma.assignment.findMany({
      where: {
        active: true,
        user: { urbanizationId },
        siren: { urbanizationId },
      },
      include: {
        user: true,
        siren: true,
      },
    });
  }

  // 📦 Excel helper (lee filas válidas si CUALQUIER campo relevante tiene datos)
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

    const important = new Set([
      'userid',
      'email',
      'username',
      'sirenid',
      'deviceid',
      'active',
    ]);

    const colCount = Math.max(
      headerRow.cellCount,
      headers.length,
      sheet.columnCount || 0,
    );

    const rows: Record<string, unknown>[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);

      let hasData = false;
      const obj: Record<string, unknown> = {};

      for (let c = 1; c <= colCount; c++) {
        const key = headers[c];
        if (!key) continue;

        let val: unknown = row.getCell(c).value;
        if (val && typeof val === 'object' && 'text' in (val as any)) {
          val = (val as any).text;
        }
        if (!hasData && important.has(key)) {
          const s = val == null ? '' : String(val).trim();
          if (s !== '') hasData = true;
        }
        obj[key] = val;
      }

      if (!hasData) continue;
      rows.push(obj);
    }
    return rows;
  }

  // 🔧 helpers de resolución
  private async resolveUserByRefs(
    userId: string,
    email: string,
    username: string,
  ): Promise<User | null> {
    let user: User | null = null;
    if (userId) {
      user = await this.prisma.user.findUnique({ where: { id: userId } });
    } else if (email && email.includes('@')) {
      user = await this.prisma.user.findUnique({ where: { email } });
    } else {
      const uname = username || (email && !email.includes('@') ? email : '');
      if (uname)
        user = await this.prisma.user.findUnique({
          where: { username: uname },
        });
    }
    return user;
  }

  private async resolveSirenByRefs(
    sirenId: string,
    deviceId: string,
  ): Promise<Siren | null> {
    let siren: Siren | null = null;
    if (sirenId) {
      siren = await this.prisma.siren.findUnique({ where: { id: sirenId } });
    } else if (deviceId) {
      siren = await this.prisma.siren.findUnique({ where: { deviceId } });
    }
    return siren;
  }

  // 🚀 Bulk import (userId|email|username y sirenId|deviceId)
  async bulkImportAssignments(
    buffer: Uint8Array | ArrayBuffer,
    currentUser: AuthUser,
    opts: BulkOptions = {},
  ) {
    const { dryRun = true } = opts;
    const rows = await this.readSheet(buffer);
    const appUrl =
      this.config.get('APP_LOGIN_URL') ||
      'https://sirenastationlink.disxor.com';

    let toCreate = 0,
      toUpdate = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const userId = String(raw['userid'] ?? '').trim();
      const email = String(raw['email'] ?? '')
        .trim()
        .toLowerCase();
      const username = String(raw['username'] ?? '').trim();

      const sirenId = String(raw['sirenid'] ?? '').trim();
      const deviceId = String(raw['deviceid'] ?? '').trim();

      const user = await this.resolveUserByRefs(userId, email, username);
      const siren = await this.resolveSirenByRefs(sirenId, deviceId);
      const active = parseBoolean(raw['active'], true);

      if (!user || !siren) {
        report.push({
          userRef: userId || email || username,
          sirenRef: sirenId || deviceId,
          status: 'error',
          error: 'User or Siren not found',
        });
        continue;
      }

      if (currentUser.roles.includes(Role.ADMIN)) {
        if (
          !user.urbanizationId ||
          !siren.urbanizationId ||
          user.urbanizationId !== currentUser.urbanizationId ||
          siren.urbanizationId !== currentUser.urbanizationId
        ) {
          report.push({
            user: user.email,
            siren: siren.deviceId,
            status: 'error',
            error: 'User or Siren outside your urbanization',
          });
          continue;
        }
      }

      const existing = await this.prisma.assignment.findFirst({
        where: { userId: user.id, sirenId: siren.id },
      });

      if (!existing) {
        toCreate++;
        if (!dryRun) {
          await this.prisma.assignment.create({
            data: { userId: user.id, sirenId: siren.id, active },
          });
          // Notificar en la creación bulk
          if (user.email && active) {
            await this.mailService.sendSirenAssignedEmail({
              to: user.email,
              name:
                `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                user.username ||
                '',
              deviceId: siren.deviceId,
              appUrl,
            });
          }
        }
        report.push({
          user: user.email,
          siren: siren.deviceId,
          status: dryRun ? 'would_create' : 'created',
        });
      } else {
        toUpdate++;
        if (!dryRun) {
          await this.prisma.assignment.update({
            where: { id: existing.id },
            data: { active },
          });
          // Notificar si se activa una asignación existente
          if (user.email && active && !existing.active) {
            await this.mailService.sendSirenAssignedEmail({
              to: user.email,
              name:
                `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                user.username ||
                '',
              deviceId: siren.deviceId,
              appUrl,
            });
          }
        }
        report.push({
          user: user.email,
          siren: siren.deviceId,
          status: dryRun ? 'would_update' : 'updated',
        });
      }
    }

    return { dryRun, toCreate, toUpdate, processed: rows.length, report };
  }

  // 🚀 Bulk delete (userId|email|username y sirenId|deviceId)
  async bulkDeleteAssignments(
    buffer: Uint8Array | ArrayBuffer,
    currentUser: AuthUser,
  ) {
    const rows = await this.readSheet(buffer);

    let removed = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const userId = String(raw['userid'] ?? '').trim();
      const email = String(raw['email'] ?? '')
        .trim()
        .toLowerCase();
      const username = String(raw['username'] ?? '').trim();

      const sirenId = String(raw['sirenid'] ?? '').trim();
      const deviceId = String(raw['deviceid'] ?? '').trim();

      const user = await this.resolveUserByRefs(userId, email, username);
      const siren = await this.resolveSirenByRefs(sirenId, deviceId);

      if (!user || !siren) {
        report.push({
          userRef: userId || email || username,
          sirenRef: sirenId || deviceId,
          status: 'error',
          error: 'User or Siren not found',
        });
        continue;
      }

      const existing = await this.prisma.assignment.findFirst({
        where: { userId: user.id, sirenId: siren.id },
      });
      if (!existing) {
        report.push({
          user: user.email,
          siren: siren.deviceId,
          status: 'not_found',
        });
        continue;
      }

      if (currentUser.roles.includes(Role.ADMIN)) {
        if (
          !user.urbanizationId ||
          !siren.urbanizationId ||
          user.urbanizationId !== currentUser.urbanizationId ||
          siren.urbanizationId !== currentUser.urbanizationId
        ) {
          report.push({
            user: user.email,
            siren: siren.deviceId,
            status: 'forbidden',
          });
          continue;
        }
      }

      await this.prisma.assignment.delete({ where: { id: existing.id } });
      removed++;
      report.push({
        user: user.email,
        siren: siren.deviceId,
        status: 'deleted',
      });
    }

    return { removed, processed: rows.length, report };
  }

  // 📄 Template Excel
  async buildAssignmentsTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('assignments');

    ws.addRow(['userId', 'email', 'username', 'sirenId', 'deviceId', 'active']);
    ws.addRow([
      'user-uuid-1',
      'jane@example.com',
      '',
      'siren-uuid-1',
      '',
      true,
    ]);
    ws.addRow(['', '', 'juanito', '', 'SRN-001', false]);

    // Congela encabezado (opcional)
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Generar binario válido
    const out = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
  }
}
