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

const NAME_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}'\- ]{0,58}[\p{L}\p{M}]$/u;
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;
const TEN_DIGITS = /^\d{10}$/;
const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

const toLower = (v: any) =>
  typeof v === 'string' ? v.trim().toLowerCase() : String(v ?? '');
const asText = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  const trimmed = s.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return trimmed.length === 0 ? null : trimmed;
};
const asTextOrNull = asText;

function normalizeKey(s?: string) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
}

function validateName(value?: string | null, field = 'name') {
  if (value == null || value === '') return null;
  const v = asText(value)!;
  if (v.length < 2 || v.length > 60 || !NAME_REGEX.test(v)) {
    throw new BadRequestException(
      `${field} inválido (solo letras, espacios, ', -; 2-60 caracteres)`,
    );
  }
  return v;
}

function validateUsername(value: string) {
  const v = toLower(value);
  if (!USERNAME_REGEX.test(v)) {
    throw new BadRequestException(
      'username inválido (usa 3-32 caracteres: a-z, 0-9, punto, guión y guión bajo)',
    );
  }
  return v;
}

function validateEmail(value: string) {
  const v = toLower(value);
  if (!EMAIL_REGEX.test(v)) {
    throw new BadRequestException('email inválido');
  }
  return v;
}

function validateDigits(value?: string | null, field = 'campo') {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (!TEN_DIGITS.test(v)) {
    throw new BadRequestException(`${field} debe tener 10 dígitos`);
  }
  return v;
}

// Detecta el 400 de Keycloak "username read-only"
function isKCUsernameReadOnlyError(e: any): boolean {
  const msg =
    (typeof e?.message === 'string' ? e.message : '') +
    (typeof e === 'string' ? e : '');
  return (
    /username/i.test(msg) &&
    /read[- ]?only|error-user-attribute-read-only/i.test(msg)
  );
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

  // 📌 Crear usuario
  async create(
    data: {
      username: string;
      email: string;
      role: Role;
      urbanizationId?: string;
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
    // Reglas por rol / cupos
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

    // Saneo + validación fuerte
    const username = validateUsername(data.username);
    const email = validateEmail(data.email);
    const firstName = validateName(data.firstName, 'firstName');
    const lastName = validateName(data.lastName, 'lastName');
    const cedula = validateDigits(data.cedula, 'cedula');
    const celular = validateDigits(data.celular, 'celular');
    const etapa = asTextOrNull(data.etapa);
    const manzana = asTextOrNull(data.manzana);
    const villa = asTextOrNull(data.villa);

    // Unicidades
    if (await this.prisma.user.findFirst({ where: { email } })) {
      throw new BadRequestException(`El email ${email} ya está registrado`);
    }
    if (await this.prisma.user.findFirst({ where: { username } })) {
      throw new BadRequestException(
        `El username ${username} ya está registrado`,
      );
    }
    if (cedula) {
      const byCed = await this.prisma.user.findFirst({ where: { cedula } });
      if (byCed)
        throw new BadRequestException(`La cédula ${cedula} ya está registrada`);
    }

    // Crear en Keycloak
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username,
      email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123',
    });

    // Sincronizar nombres si existen
    if (firstName || lastName) {
      await this.kcAdmin.updateUserProfile(keycloakId, {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      });
    }

    // Guardar en BD
    return this.prisma.user.create({
      data: {
        ...data,
        username,
        email,
        keycloakId,
        sessionLimit: null,
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

  // 📌 Actualizar usuario (endpoint individual)
  async update(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      role: Role;
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

    // Roles
    if (!requestingUser.roles.includes(Role.SUPERADMIN)) {
      if (requestingUser.roles.includes(Role.ADMIN)) {
        if (user.urbanizationId !== requestingUser.urbanizationId) {
          throw new ForbiddenException('User outside your urbanization');
        }
        if (data.role === 'SUPERADMIN' || data.role === 'ADMIN') {
          throw new ForbiddenException('Admins cannot assign ADMIN/SUPERADMIN');
        }
        if (data.sessionLimit !== undefined) {
          throw new ForbiddenException('Admins cannot edit sessionLimit');
        }
      } else {
        throw new ForbiddenException('You cannot update users');
      }
    }
    if (
      data.sessionLimit !== undefined &&
      !requestingUser.roles.includes(Role.SUPERADMIN)
    ) {
      delete data.sessionLimit;
    }

    // Saneo + unicidades si cambian
    let email = user.email;
    if (data.email && data.email !== user.email) {
      email = validateEmail(data.email);
      const exists = await this.prisma.user.findFirst({
        where: { email, id: { not: id } },
      });
      if (exists)
        throw new BadRequestException(`El email ${email} ya está registrado`);
    }

    let username = user.username;
    if (data.username && data.username !== user.username) {
      const desired = validateUsername(data.username);
      // Si está vinculado a Keycloak, intentamos cambiarlo allí primero.
      if (user.keycloakId) {
        try {
          await this.kcAdmin.updateUserProfile(user.keycloakId, {
            username: desired,
          });
          username = desired; // ok
        } catch (e) {
          if (isKCUsernameReadOnlyError(e)) {
            // Política de Keycloak: username no editable
            throw new BadRequestException(
              'El username no puede cambiarse por política del sistema (Keycloak: read-only).',
            );
          }
          throw e;
        }
      } else {
        username = desired;
      }
      // Verificar unicidad en BD
      const exists = await this.prisma.user.findFirst({
        where: { username, id: { not: id } },
      });
      if (exists)
        throw new BadRequestException(
          `El username ${username} ya está registrado`,
        );
    }

    const firstName =
      data.firstName !== undefined
        ? validateName(data.firstName, 'firstName')
        : (user.firstName ?? null);
    const lastName =
      data.lastName !== undefined
        ? validateName(data.lastName, 'lastName')
        : (user.lastName ?? null);

    let cedula = user.cedula ?? null;
    if (data.cedula !== undefined && data.cedula !== user.cedula) {
      cedula = validateDigits(data.cedula, 'cedula');
      if (cedula) {
        const byCed = await this.prisma.user.findFirst({
          where: { cedula, id: { not: id } },
        });
        if (byCed)
          throw new BadRequestException(
            `La cédula ${cedula} ya está registrada`,
          );
      }
    }

    const celular =
      data.celular !== undefined
        ? validateDigits(data.celular, 'celular')
        : (user.celular ?? null);

    const etapa =
      data.etapa !== undefined
        ? asTextOrNull(data.etapa)
        : (user.etapa ?? null);
    const manzana =
      data.manzana !== undefined
        ? asTextOrNull(data.manzana)
        : (user.manzana ?? null);
    const villa =
      data.villa !== undefined
        ? asTextOrNull(data.villa)
        : (user.villa ?? null);

    // Sincronizar perfil básico en Keycloak (email/first/last)
    if (user.keycloakId) {
      const profile: any = {};
      if (data.email && email !== user.email) profile.email = email;
      if (data.firstName !== undefined) profile.firstName = firstName ?? '';
      if (data.lastName !== undefined) profile.lastName = lastName ?? '';
      if (Object.keys(profile).length) {
        await this.kcAdmin.updateUserProfile(user.keycloakId, profile);
      }
      if (data.role && data.role !== user.role) {
        await this.kcAdmin.replaceRealmRole(user.keycloakId, data.role);
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        email,
        username,
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

  // 📌 Eliminar usuario
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

    if (user.keycloakId) {
      try {
        await this.kcAdmin.deleteUser(user.keycloakId);
      } catch (e) {
        this.kcAdmin['logger']?.warn?.(
          `Failed to delete user in Keycloak: ${user.keycloakId}`,
        );
      }
    }

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

  // 🔎 Validar/Sanear una fila de bulk
  private validateBulkRow(raw: Record<string, any>) {
    const res = {
      email: '',
      username: '',
      role: '' as Role | '',
      urbanizationId: null as string | null,
      urbanization: '',
      firstName: null as string | null,
      lastName: null as string | null,
      cedula: null as string | null,
      celular: null as string | null,
      etapa: null as string | null,
      manzana: null as string | null,
      villa: null as string | null,
    };
    const errors: string[] = [];

    const emailIn = raw['email'];
    const usernameIn = raw['username'];
    const roleStr = String(raw['role'] ?? '')
      .trim()
      .toUpperCase();
    const urbName = raw['urbanization'];
    const urbIdFromFile = raw['urbanizationid'];

    if (emailIn) {
      try {
        res.email = validateEmail(String(emailIn));
      } catch (e: any) {
        errors.push(e.message || 'email inválido');
      }
    }
    if (usernameIn) {
      try {
        res.username = validateUsername(String(usernameIn));
      } catch (e: any) {
        errors.push(e.message || 'username inválido');
      }
    }
    if (!res.email && !res.username) {
      errors.push('email or username required');
    }

    if (!(roleStr in Role)) errors.push('invalid role');
    else res.role = roleStr as Role;

    // Nombres
    try {
      res.firstName = validateName(
        (raw['firstname'] ?? raw['nombre']) as string | null,
        'firstName',
      );
    } catch (e: any) {
      errors.push(e.message);
    }
    try {
      res.lastName = validateName(
        (raw['lastname'] ?? raw['apellido']) as string | null,
        'lastName',
      );
    } catch (e: any) {
      errors.push(e.message);
    }

    // Cédula/celular
    try {
      res.cedula = validateDigits(raw['cedula'] as any, 'cedula');
    } catch (e: any) {
      errors.push(e.message);
    }
    try {
      res.celular = validateDigits(raw['celular'] as any, 'celular');
    } catch (e: any) {
      errors.push(e.message);
    }

    // Siempre como texto (aunque Excel mande número)
    res.etapa = asTextOrNull(raw['etapa'] ?? null);
    res.manzana = asTextOrNull(raw['manzana'] ?? null);
    res.villa = asTextOrNull(raw['villa'] ?? null);

    res.urbanization = asText(raw['urbanization']) ?? '';
    res.urbanizationId = asTextOrNull(raw['urbanizationid']);

    return { res, errors };
  }

  // 🚀 BULK IMPORT
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
      const { res, errors } = this.validateBulkRow(raw);
      if (errors.length) {
        report.push({
          key: res.email || res.username,
          status: 'error',
          error: errors.join('; '),
        });
        skipped++;
        continue;
      }

      // Resolver urbanizationId
      let urbanizationId: string | null = null;
      if (isAdmin) {
        if (res.role === Role.SUPERADMIN || res.role === Role.ADMIN) {
          report.push({
            key: res.email || res.username,
            status: 'error',
            error: 'ADMIN cannot assign ADMIN/SUPERADMIN',
          });
          skipped++;
          continue;
        }
        urbanizationId = adminUrbId;
      } else {
        if (res.urbanizationId) {
          const exists = await this.prisma.urbanization.findUnique({
            where: { id: res.urbanizationId },
          });
          if (!exists) {
            report.push({
              key: res.email || res.username,
              status: 'error',
              error: `urbanizationId not found: ${res.urbanizationId}`,
            });
            skipped++;
            continue;
          }
          urbanizationId = res.urbanizationId;
        } else if (res.urbanization) {
          const exists = await this.prisma.urbanization.findFirst({
            where: { name: res.urbanization },
          });
          if (!exists) {
            report.push({
              key: res.email || res.username,
              status: 'error',
              error: `urbanization name not found: ${res.urbanization}`,
            });
            skipped++;
            continue;
          }
          urbanizationId = exists.id;
        }
      }

      // Buscar existente por email/username
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(res.email ? [{ email: res.email }] : []),
            ...(res.username ? [{ username: res.username }] : []),
          ],
        },
      });

      // cédula única
      if (res.cedula) {
        const holder = await this.prisma.user.findFirst({
          where: existing
            ? { cedula: res.cedula, id: { not: existing.id } }
            : { cedula: res.cedula },
        });
        if (holder) {
          report.push({
            key: res.email || res.username,
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
              username: res.username || res.email,
              email: res.email || `${res.username}@placeholder.local`,
              role: res.role as Role,
              temporaryPassword: defaultPass,
            });
            keycloakId = kc.id;

            if (res.firstName || res.lastName) {
              await this.kcAdmin.updateUserProfile(kc.id, {
                ...(res.firstName ? { firstName: res.firstName } : {}),
                ...(res.lastName ? { lastName: res.lastName } : {}),
              });
            }
          }

          await this.prisma.user.create({
            data: {
              email: res.email || `${res.username}@placeholder.local`,
              username: res.username,
              role: res.role as Role,
              urbanizationId,
              keycloakId,
              firstName: res.firstName,
              lastName: res.lastName,
              cedula: res.cedula,
              celular: res.celular,
              etapa: res.etapa,
              manzana: res.manzana,
              villa: res.villa,
            },
          });
        }
        report.push({
          key: res.email || res.username,
          status: dryRun ? 'would_create' : 'created',
        });
        continue;
      }

      // UPDATE (con alcance del admin)
      if (
        isAdmin &&
        existing.urbanizationId !== requestingUser.urbanizationId
      ) {
        report.push({
          key: res.email || res.username,
          status: 'forbidden',
          error: 'Usuario fuera de tu urbanización',
        });
        skipped++;
        continue;
      }

      toUpdate++;
      let note: string | undefined;

      if (!dryRun) {
        if (provisionKeycloak && existing.keycloakId) {
          const updateProfile: any = {};
          if (res.email && res.email !== existing.email)
            updateProfile.email = res.email;
          if (res.username && res.username !== existing.username)
            updateProfile.username = res.username;
          if (res.firstName !== null && res.firstName !== undefined)
            updateProfile.firstName = res.firstName;
          if (res.lastName !== null && res.lastName !== undefined)
            updateProfile.lastName = res.lastName;

          if (Object.keys(updateProfile).length) {
            try {
              await this.kcAdmin.updateUserProfile(
                existing.keycloakId,
                updateProfile,
              );
            } catch (e) {
              // Si el realm no permite editar username, lo omitimos y reintentamos.
              if (isKCUsernameReadOnlyError(e) && updateProfile.username) {
                delete updateProfile.username;
                note = 'username read-only en Keycloak; se omitió cambio';
                if (Object.keys(updateProfile).length) {
                  await this.kcAdmin.updateUserProfile(
                    existing.keycloakId,
                    updateProfile,
                  );
                }
              } else {
                throw e;
              }
            }
          }
          if (res.role && res.role !== existing.role) {
            await this.kcAdmin.replaceRealmRole(
              existing.keycloakId,
              res.role as Role,
            );
          }
        } else if (provisionKeycloak && !existing.keycloakId) {
          const kc = await this.kcAdmin.createUser({
            username:
              res.username || existing.username || res.email || existing.email,
            email: res.email || existing.email,
            role: res.role as Role,
            temporaryPassword: defaultPass,
          });
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { keycloakId: kc.id },
          });
          if (res.firstName || res.lastName) {
            await this.kcAdmin.updateUserProfile(kc.id, {
              ...(res.firstName ? { firstName: res.firstName } : {}),
              ...(res.lastName ? { lastName: res.lastName } : {}),
            });
          }
          existing.keycloakId = kc.id;
        }

        // Si Keycloak no dejó cambiar username, no lo cambiamos en BD
        const usernameToPersist = note?.includes('username read-only')
          ? existing.username
          : res.username || existing.username;

        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            username: usernameToPersist,
            role: (res.role as Role) || existing.role,
            urbanizationId: urbanizationId ?? existing.urbanizationId,
            firstName: res.firstName,
            lastName: res.lastName,
            cedula: res.cedula,
            celular: res.celular,
            etapa: res.etapa,
            manzana: res.manzana,
            villa: res.villa,
            ...(res.email ? { email: res.email } : {}),
          },
        });
      }

      report.push({
        key: res.email || res.username,
        status: dryRun ? 'would_update' : 'updated',
        ...(note ? { note } : {}),
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

  // 🚀 BULK DELETE
  async bulkDeleteUsers(buffer: Uint8Array | ArrayBuffer, requestingUser: any) {
    const rows = await this.readSheet(buffer);
    const isSuper = requestingUser.roles.includes(Role.SUPERADMIN);
    const isAdmin = requestingUser.roles.includes(Role.ADMIN);
    if (!(isSuper || isAdmin)) throw new ForbiddenException('Forbidden');

    let removed = 0;
    const report: any[] = [];

    for (const raw of rows) {
      const email = toLower(raw['email'] ?? '');
      const username = asText(raw['username'] ?? '') ?? '';

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
      '',
    ]);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
}
