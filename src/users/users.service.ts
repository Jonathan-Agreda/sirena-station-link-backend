import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import * as ExcelJS from 'exceljs';

type BulkOptions = { dryRun?: boolean; provisionKeycloak?: boolean };
function normalizeKey(s?: string) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private kcAdmin: KeycloakAdminService,
  ) {}

  // 📌 Listar usuarios
  async findAll(requestingUser: any) {
    if (requestingUser.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.user.findMany({ include: { urbanization: true } });
    }
    if (requestingUser.roles.includes(Role.ADMIN)) {
      return this.prisma.user.findMany({
        where: { urbanizationId: requestingUser.urbanizationId },
        include: { urbanization: true },
      });
    }
    throw new ForbiddenException('You cannot list users');
  }

  // 📌 Ver un usuario
  async findOne(id: string, requestingUser: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { urbanization: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (requestingUser.roles.includes(Role.SUPERADMIN)) return user;

    if (requestingUser.roles.includes(Role.ADMIN)) {
      if (user.urbanizationId === requestingUser.urbanizationId) return user;
      throw new ForbiddenException('User outside your urbanization');
    }

    if (requestingUser.sub === user.keycloakId) return user;

    throw new ForbiddenException('You cannot view this user');
  }

  // 📌 Crear usuario (sincroniza Keycloak)
  async create(
    data: {
      username: string;
      email: string;
      role: Role;
      urbanizationId?: string;
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    },
    requestingUser: any,
  ) {
    // Reglas por rol
    if (!requestingUser.roles.includes(Role.SUPERADMIN)) {
      if (!requestingUser.roles.includes(Role.ADMIN)) {
        throw new ForbiddenException('You cannot create users');
      }
      if (data.role === Role.SUPERADMIN || data.role === Role.ADMIN) {
        throw new ForbiddenException('Admins cannot create ADMIN/SUPERADMIN');
      }
      data.urbanizationId = requestingUser.urbanizationId;

      const urb = await this.prisma.urbanization.findUnique({
        where: { id: data.urbanizationId },
        include: { users: true },
      });
      if (!urb) throw new NotFoundException('Urbanization not found');
      if (urb.maxUsers && urb.users.length >= urb.maxUsers) {
        throw new ForbiddenException('Max users limit reached');
      }
    }

    // Crear en Keycloak
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username: data.username,
      email: data.email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123',
    });

    // Guardar en BD
    return this.prisma.user.create({
      data: { ...data, keycloakId, sessionLimit: null },
    });
  }

  // 📌 Actualizar usuario (sincroniza email/username/role en Keycloak)
  async update(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      role: Role;
      etapa: string;
      manzana: string;
      villa: string;
      alicuota: boolean;
      urbanizationId: string;
      sessionLimit: number | null;
    }>,
    requestingUser: any,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // 🔒 Validaciones de rol
    if (!requestingUser.roles.includes(Role.SUPERADMIN)) {
      if (requestingUser.roles.includes(Role.ADMIN)) {
        if (user.urbanizationId !== requestingUser.urbanizationId) {
          throw new ForbiddenException('User outside your urbanization');
        }
        if (data.role === Role.SUPERADMIN || data.role === Role.ADMIN) {
          throw new ForbiddenException('Admins cannot assign ADMIN/SUPERADMIN');
        }
        if (data.sessionLimit !== undefined) {
          throw new ForbiddenException('Admins cannot edit sessionLimit');
        }
      } else {
        throw new ForbiddenException('You cannot update users');
      }
    }

    // 🔒 Solo SUPERADMIN puede modificar sessionLimit (defensivo)
    if (
      data.sessionLimit !== undefined &&
      !requestingUser.roles.includes(Role.SUPERADMIN)
    ) {
      delete data.sessionLimit;
    }

    // 🔄 Sincronizar con Keycloak (si el usuario tiene keycloakId)
    if (user.keycloakId) {
      // Email y/o username
      if (data.email || data.username) {
        await this.kcAdmin.updateUserProfile(user.keycloakId, {
          ...(data.email ? { email: data.email } : {}),
          ...(data.username ? { username: data.username } : {}),
        });
      }
      // Rol
      if (data.role && data.role !== user.role) {
        await this.kcAdmin.replaceRealmRole(user.keycloakId, data.role);
      }
    }

    // ✅ Persistir cambios en BD
    return this.prisma.user.update({ where: { id }, data });
  }

  // 📌 Eliminar usuario (borra Keycloak y BD)
  async remove(id: string, requestingUser: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (requestingUser.roles.includes(Role.SUPERADMIN)) {
      // ok
    } else if (requestingUser.roles.includes(Role.ADMIN)) {
      if (user.urbanizationId !== requestingUser.urbanizationId) {
        throw new ForbiddenException('User outside your urbanization');
      }
    } else throw new ForbiddenException('You cannot delete users');

    // Primero intentar borrar en Keycloak (si existe)
    if (user.keycloakId) {
      try {
        await this.kcAdmin.deleteUser(user.keycloakId);
      } catch (e) {
        // No abortamos; dejamos registro si tu kcAdmin expone logger
        this.kcAdmin['logger']?.warn?.(
          `Failed to delete user in Keycloak: ${user.keycloakId}`,
        );
      }
    }

    // Luego borrar en BD
    return this.prisma.user.delete({ where: { id } });
  }

  // 🔥 Sesiones
  async listSessions(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.keycloakId)
      throw new NotFoundException('User or KeycloakId not found');
    return this.kcAdmin.listUserSessions(user.keycloakId);
  }

  async terminateSession(id: string, sessionId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.keycloakId)
      throw new NotFoundException('User or KeycloakId not found');
    await this.kcAdmin.deleteSession(sessionId);
    return { success: true, sessionId };
  }

  // ========== 📦 BULK EXCEL HELPERS ==========
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
        if (typeof val === 'object' && val && 'text' in val)
          val = (val as any).text;
        obj[key] = val;
      }
      rows.push(obj);
    }
    return rows;
  }

  // 🚀 BULK IMPORT (crea/actualiza y sincroniza con Keycloak si provisionKeycloak=true)
  async bulkImportUsers(
    buffer: Uint8Array | ArrayBuffer,
    requestingUser: any,
    opts: BulkOptions = {},
  ) {
    const { dryRun = true, provisionKeycloak = true } = opts;
    const rows = await this.readSheet(buffer);

    const isSuper = requestingUser.roles.includes(Role.SUPERADMIN);
    const isAdmin = requestingUser.roles.includes(Role.ADMIN);
    if (!(isSuper || isAdmin)) throw new ForbiddenException('Forbidden');

    let toCreate = 0,
      toUpdate = 0;
    const report: any[] = [];
    const defaultPass = process.env.USER_DEFAULT_PASSWORD || 'changeme123';

    const adminUrbId = isAdmin ? requestingUser.urbanizationId : null;

    for (const raw of rows) {
      const email = String(raw['email'] ?? '')
        .trim()
        .toLowerCase();
      const username = (String(raw['username'] ?? '').trim() || null) as
        | string
        | null;
      const roleStr = String(raw['role'] ?? '')
        .trim()
        .toUpperCase();
      const urbName = String(raw['urbanization'] ?? '').trim();
      const urbIdFromFile = String(raw['urbanizationid'] ?? '').trim();

      if (!email || !(roleStr in Role)) {
        report.push({ email, status: 'error', error: 'invalid email/role' });
        continue;
      }
      const role = roleStr as Role;

      // Resolver urbanizationId
      let urbanizationId: string | null = null;
      if (isAdmin) {
        if (role === Role.SUPERADMIN || role === Role.ADMIN) {
          report.push({
            email,
            status: 'error',
            error: 'ADMIN cannot assign ADMIN/SUPERADMIN',
          });
          continue;
        }
        urbanizationId = adminUrbId;
      } else {
        if (urbIdFromFile) {
          const exists = await this.prisma.urbanization.findUnique({
            where: { id: urbIdFromFile },
          });
          if (!exists) {
            report.push({
              email,
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
              email,
              status: 'error',
              error: `urbanization name not found: ${urbName}`,
            });
            continue;
          }
          urbanizationId = exists.id;
        }
      }

      const existing = await this.prisma.user.findFirst({ where: { email } });

      // CREATE
      if (!existing) {
        toCreate++;
        if (!dryRun) {
          let keycloakId: string | null = null;

          if (provisionKeycloak) {
            const kc = await this.kcAdmin.createUser({
              username: username || email,
              email,
              role,
              temporaryPassword: defaultPass,
            });
            keycloakId = kc.id;
          }

          await this.prisma.user.create({
            data: { email, username, role, urbanizationId, keycloakId },
          });
        }
        report.push({ email, status: dryRun ? 'would_create' : 'created' });
        continue;
      }

      // UPDATE
      toUpdate++;
      if (!dryRun) {
        // Sincronizar con KC si corresponde
        if (provisionKeycloak) {
          // Si no tiene KC y se pide provision, créalo y enlaza
          if (!existing.keycloakId) {
            const kc = await this.kcAdmin.createUser({
              username: username || existing.username || email,
              email,
              role,
              temporaryPassword: defaultPass,
            });
            await this.prisma.user.update({
              where: { id: existing.id },
              data: { keycloakId: kc.id },
            });
            existing.keycloakId = kc.id;
          } else {
            // Actualizar perfil (email/username)
            if (
              (username && username !== existing.username) ||
              email !== existing.email
            ) {
              await this.kcAdmin.updateUserProfile(existing.keycloakId, {
                ...(email !== existing.email ? { email } : {}),
                ...(username && username !== existing.username
                  ? { username }
                  : {}),
              });
            }
            // Cambiar rol si difiere
            if (role !== existing.role) {
              await this.kcAdmin.replaceRealmRole(existing.keycloakId, role);
            }
          }
        }

        await this.prisma.user.update({
          where: { id: existing.id },
          data: { username, role, urbanizationId },
        });
      }
      report.push({ email, status: dryRun ? 'would_update' : 'updated' });
    }

    return { dryRun, toCreate, toUpdate, processed: rows.length, report };
  }

  // 🚀 BULK DELETE (elimina en Keycloak y BD)
  async bulkDeleteUsers(buffer: Uint8Array | ArrayBuffer, requestingUser: any) {
    const rows = await this.readSheet(buffer);
    const isSuper = requestingUser.roles.includes(Role.SUPERADMIN);
    const isAdmin = requestingUser.roles.includes(Role.ADMIN);
    if (!(isSuper || isAdmin)) throw new ForbiddenException('Forbidden');

    let removed = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const email = String(raw['email'] ?? '')
        .trim()
        .toLowerCase();
      const username = String(raw['username'] ?? '').trim();

      if (!email && !username) {
        report.push({
          key: null,
          status: 'error',
          error: 'email or username required',
        });
        continue;
      }

      const target = await this.prisma.user.findFirst({
        where: { OR: [{ email }, ...(username ? [{ username }] : [])] },
      });
      if (!target) {
        report.push({ key: email || username, status: 'not_found' });
        continue;
      }
      if (isAdmin && target.urbanizationId !== requestingUser.urbanizationId) {
        report.push({ key: email || username, status: 'forbidden' });
        continue;
      }

      // Borrar en Keycloak primero (si aplica)
      if (target.keycloakId) {
        try {
          await this.kcAdmin.deleteUser(target.keycloakId);
        } catch (e) {
          this.kcAdmin['logger']?.warn?.(
            `Failed to delete user in Keycloak: ${target.keycloakId}`,
          );
        }
      }

      await this.prisma.user.delete({ where: { id: target.id } });
      removed++;
      report.push({ key: email || username, status: 'deleted' });
    }

    return { removed, processed: rows.length, report };
  }

  // 🚀 TEMPLATE
  async buildUsersTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('users');
    ws.addRow(['email', 'username', 'role', 'urbanization', 'urbanizationId']);
    ws.addRow(['jane@example.com', 'jane', 'RESIDENTE', 'Mi Urb', '']);
    ws.addRow(['admin@urb.com', 'admin01', 'ADMIN', 'Mi Urb', '']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
}
