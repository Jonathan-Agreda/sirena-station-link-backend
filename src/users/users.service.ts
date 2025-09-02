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

  // 📌 Crear usuario (sincroniza con Keycloak nombre/apellido si se proveen)
  async create(
    data: {
      username: string;
      email: string;
      role: Role;
      urbanizationId?: string;

      // nuevos campos
      firstName?: string | null;
      lastName?: string | null;
      cedula?: string | null;
      celular?: string | null;
      etapa?: string | null;
      manzana?: string | null;
      villa?: string | null;

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

    // unicidad por cédula (si llega)
    if (data.cedula) {
      const byCed = await this.prisma.user.findFirst({
        where: { cedula: data.cedula },
      });
      if (byCed)
        throw new BadRequestException(
          `La cédula ${data.cedula} ya está registrada`,
        );
    }

    // Crear en Keycloak
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username: data.username,
      email: data.email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123',
    });

    // Si proveíste nombres, sincronízalos después de crear
    if (data.firstName || data.lastName) {
      await this.kcAdmin.updateUserProfile(keycloakId, {
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
      });
    }

    // Guardar en BD
    return this.prisma.user.create({
      data: {
        ...data,
        keycloakId,
        sessionLimit: null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        cedula: data.cedula ?? null,
        celular: data.celular ?? null,
        etapa: data.etapa ?? null,
        manzana: data.manzana ?? null,
        villa: data.villa ?? null,
      },
    });
  }

  // 📌 Actualizar usuario (sincroniza email/username/role/nombres en Keycloak)
  async update(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      role: Role;

      // nuevos campos
      firstName: string | null;
      lastName: string | null;
      cedula: string | null;
      celular: string | null;
      etapa: string | null;
      manzana: string | null;
      villa: string | null;

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

    // 🔒 SUPERADMIN-only (defensivo)
    if (
      data.sessionLimit !== undefined &&
      !requestingUser.roles.includes(Role.SUPERADMIN)
    ) {
      delete data.sessionLimit;
    }

    // unicidad por cédula al actualizar
    if (data.cedula !== undefined && data.cedula !== user.cedula) {
      if (data.cedula) {
        const byCed = await this.prisma.user.findFirst({
          where: { cedula: data.cedula, id: { not: id } },
        });
        if (byCed)
          throw new BadRequestException(
            `La cédula ${data.cedula} ya está registrada`,
          );
      }
    }

    // 🔄 Sincronizar con Keycloak (si el usuario tiene keycloakId)
    if (user.keycloakId) {
      // Email, username, firstName, lastName
      if (
        data.email ||
        data.username ||
        data.firstName !== undefined ||
        data.lastName !== undefined
      ) {
        await this.kcAdmin.updateUserProfile(user.keycloakId, {
          ...(data.email ? { email: data.email } : {}),
          ...(data.username ? { username: data.username } : {}),
          ...(data.firstName !== undefined
            ? { firstName: data.firstName ?? '' }
            : {}),
          ...(data.lastName !== undefined
            ? { lastName: data.lastName ?? '' }
            : {}),
        });
      }
      // Rol
      if (data.role && data.role !== user.role) {
        await this.kcAdmin.replaceRealmRole(user.keycloakId, data.role);
      }
    }

    // ✅ Persistir cambios en BD
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        firstName: data.firstName ?? user.firstName ?? null,
        lastName: data.lastName ?? user.lastName ?? null,
        cedula: data.cedula ?? user.cedula ?? null,
        celular: data.celular ?? user.celular ?? null,
        etapa: data.etapa ?? user.etapa ?? null,
        manzana: data.manzana ?? user.manzana ?? null,
        villa: data.villa ?? user.villa ?? null,
      },
    });
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

      // considerar vacía solo si TODAS las celdas de la fila están vacías
      const allEmpty = [...Array(headerRow.cellCount).keys()].every(
        (i) => row.getCell(i + 1).value == null,
      );
      if (allEmpty) continue;

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
      toUpdate = 0,
      skipped = 0;
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
      if (!(roleStr in Role)) {
        report.push({
          key: email || username,
          status: 'error',
          error: 'invalid role',
        });
        skipped++;
        continue;
      }
      const role = roleStr as Role;

      const urbName = String(raw['urbanization'] ?? '').trim();
      const urbIdFromFile = String(raw['urbanizationid'] ?? '').trim();

      // nuevos campos en bulk
      const firstName = (String(
        raw['firstname'] ?? raw['nombre'] ?? '',
      ).trim() || null) as string | null;
      const lastName = (String(
        raw['lastname'] ?? raw['apellido'] ?? '',
      ).trim() || null) as string | null;
      const cedula = (String(raw['cedula'] ?? '').trim() || null) as
        | string
        | null;
      const celular = (String(raw['celular'] ?? '').trim() || null) as
        | string
        | null;
      const etapa = (String(raw['etapa'] ?? '').trim() || null) as
        | string
        | null;
      const manzana = (String(raw['manzana'] ?? '').trim() || null) as
        | string
        | null;
      const villa = (String(raw['villa'] ?? '').trim() || null) as
        | string
        | null;

      if (!email && !username) {
        report.push({ status: 'error', error: 'email or username required' });
        skipped++;
        continue;
      }

      // Resolver urbanizationId
      let urbanizationId: string | null = null;
      if (isAdmin) {
        if (role === Role.SUPERADMIN || role === Role.ADMIN) {
          report.push({
            key: email || username,
            status: 'error',
            error: 'ADMIN cannot assign ADMIN/SUPERADMIN',
          });
          skipped++;
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
              key: email || username,
              status: 'error',
              error: `urbanizationId not found: ${urbIdFromFile}`,
            });
            skipped++;
            continue;
          }
          urbanizationId = urbIdFromFile;
        } else if (urbName) {
          const exists = await this.prisma.urbanization.findFirst({
            where: { name: urbName },
          });
          if (!exists) {
            report.push({
              key: email || username,
              status: 'error',
              error: `urbanization name not found: ${urbName}`,
            });
            skipped++;
            continue;
          }
          urbanizationId = exists.id;
        }
      }

      // Buscar usuario por email o username
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(email ? [{ email }] : []),
            ...(username ? [{ username }] : []),
          ],
        },
      });

      // Validación de cédula única
      if (cedula) {
        const holder = await this.prisma.user.findFirst({
          where: existing ? { cedula, id: { not: existing.id } } : { cedula },
        });
        if (holder) {
          report.push({
            key: email || username,
            status: 'error',
            error: 'Cédula ya registrada',
          });
          skipped++;
          continue;
        }
      }

      // CREATE
      if (!existing) {
        toCreate++;
        if (!dryRun) {
          let keycloakId: string | null = null;

          if (provisionKeycloak) {
            const kc = await this.kcAdmin.createUser({
              username: username || email,
              email: email || username!, // fallback si solo vino username
              role,
              temporaryPassword: defaultPass,
            });
            keycloakId = kc.id;

            if (firstName || lastName) {
              await this.kcAdmin.updateUserProfile(kc.id, {
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
              });
            }
          }

          await this.prisma.user.create({
            data: {
              email: email || `${username}@placeholder.local`,
              username,
              role,
              urbanizationId,
              keycloakId,
              firstName,
              lastName,
              cedula,
              celular,
              etapa,
              manzana,
              villa,
            },
          });
        }
        report.push({
          key: email || username,
          status: dryRun ? 'would_create' : 'created',
        });
        continue;
      }

      // UPDATE
      if (
        isAdmin &&
        existing.urbanizationId !== requestingUser.urbanizationId
      ) {
        report.push({
          key: email || username,
          status: 'forbidden',
          error: 'Usuario fuera de tu urbanización',
        });
        skipped++;
        continue;
      }

      toUpdate++;
      if (!dryRun) {
        // Sincronizar con KC si corresponde
        if (provisionKeycloak) {
          // Si no tiene KC y se pide provision, créalo y enlaza
          if (!existing.keycloakId) {
            const kc = await this.kcAdmin.createUser({
              username:
                username || existing.username || email || existing.email,
              email: email || existing.email,
              role,
              temporaryPassword: defaultPass,
            });
            await this.prisma.user.update({
              where: { id: existing.id },
              data: { keycloakId: kc.id },
            });
            if (firstName || lastName) {
              await this.kcAdmin.updateUserProfile(kc.id, {
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
              });
            }
            existing.keycloakId = kc.id;
          } else {
            // Actualizar perfil (email/username/firstName/lastName)
            const updateProfile: any = {};
            if (email && email !== existing.email) updateProfile.email = email;
            if (username && username !== existing.username)
              updateProfile.username = username;
            if (firstName !== null && firstName !== undefined)
              updateProfile.firstName = firstName;
            if (lastName !== null && lastName !== undefined)
              updateProfile.lastName = lastName;
            if (Object.keys(updateProfile).length > 0) {
              await this.kcAdmin.updateUserProfile(
                existing.keycloakId,
                updateProfile,
              );
            }
            // Cambiar rol si difiere
            if (role !== existing.role) {
              await this.kcAdmin.replaceRealmRole(existing.keycloakId, role);
            }
          }
        }

        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            username,
            role,
            urbanizationId,
            firstName,
            lastName,
            cedula,
            celular,
            etapa,
            manzana,
            villa,
            ...(email ? { email } : {}),
          },
        });
      }
      report.push({
        key: email || username,
        status: dryRun ? 'would_update' : 'updated',
      });
    }

    return {
      dryRun,
      toCreate,
      toUpdate,
      skipped,
      processed: rows.length,
      report,
    };
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

    ws.addRow([
      'email',
      'username',
      'role',
      'urbanization',
      'urbanizationId',
      'firstName',
      'lastName',
      'cedula',
      'celular',
      'etapa',
      'manzana',
      'villa',
    ]);
    ws.addRow([
      'jona@example.com',
      'jona',
      'ADMIN',
      'Lomas del Bosque',
      '',
      'Jonathan',
      'Agreda',
      '0102030405',
      '0999999999',
      '1',
      'B',
      '12',
    ]);
    ws.addRow([
      'jmurillo@example.com',
      'jmurillo',
      'GUARDIA',
      'Lomas del Bosque',
      '',
      'Juan',
      'Murillo',
      '',
      '',
      '',
      '',
    ]);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
}
