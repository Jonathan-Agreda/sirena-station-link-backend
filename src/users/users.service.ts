import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private kcAdmin: KeycloakAdminService,
  ) {}

  // 📌 Listar usuarios
  async findAll(requestingUser: any) {
    if (requestingUser.roles.includes(Role.SUPERADMIN)) {
      // SUPERADMIN → todos
      return this.prisma.user.findMany({ include: { urbanization: true } });
    }

    if (requestingUser.roles.includes(Role.ADMIN)) {
      // ADMIN → solo de su urbanización
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

    if (requestingUser.roles.includes(Role.SUPERADMIN)) {
      return user;
    }

    if (requestingUser.roles.includes(Role.ADMIN)) {
      if (user.urbanizationId === requestingUser.urbanizationId) return user;
      throw new ForbiddenException('User outside your urbanization');
    }

    // GUARDIA/RESIDENTE → solo su propio perfil
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
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    },
    requestingUser: any,
  ) {
    // 1. Reglas por rol
    if (!requestingUser.roles.includes(Role.SUPERADMIN)) {
      if (!requestingUser.roles.includes(Role.ADMIN)) {
        throw new ForbiddenException('You cannot create users');
      }
      // ADMIN → no puede crear SUPERADMIN ni ADMIN
      if (data.role === Role.SUPERADMIN || data.role === Role.ADMIN) {
        throw new ForbiddenException(
          'Admins cannot create ADMIN or SUPERADMIN',
        );
      }
      // ADMIN → siempre en su propia urbanización
      data.urbanizationId = requestingUser.urbanizationId;

      // validar maxUsers
      const urb = await this.prisma.urbanization.findUnique({
        where: { id: data.urbanizationId },
        include: { users: true },
      });
      if (!urb) throw new NotFoundException('Urbanization not found');
      if (urb.maxUsers && urb.users.length >= urb.maxUsers) {
        throw new ForbiddenException(
          'Max users limit reached for urbanization',
        );
      }
    }

    // 2. Crear en Keycloak
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username: data.username,
      email: data.email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123',
    });

    // 3. Guardar en BD
    return this.prisma.user.create({
      data: {
        ...data,
        keycloakId,
        sessionLimit: null, // 🔒 nunca editable por admin
      },
    });
  }

  // 📌 Actualizar usuario
  async update(
    id: string,
    data: Partial<{
      email: string;
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

    // SUPERADMIN puede todo
    if (!requestingUser.roles.includes(Role.SUPERADMIN)) {
      if (requestingUser.roles.includes(Role.ADMIN)) {
        // ADMIN solo dentro de su urbanización
        if (user.urbanizationId !== requestingUser.urbanizationId) {
          throw new ForbiddenException('User outside your urbanization');
        }
        // ADMIN no puede promover roles ni tocar sessionLimit
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

    // 1. Sincronizar email con Keycloak
    if (data.email && user.keycloakId) {
      const ok = await this.kcAdmin.updateUserProfile(user.keycloakId, {
        email: data.email,
      });
      if (!ok) throw new Error('Keycloak update email failed');
    }

    // 2. Cambiar rol en Keycloak
    if (data.role && user.keycloakId && data.role !== user.role) {
      await this.kcAdmin.replaceRealmRole(user.keycloakId, data.role);
    }

    // 3. Persistir en BD
    return this.prisma.user.update({
      where: { id },
      data,
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
    } else {
      throw new ForbiddenException('You cannot delete users');
    }

    if (user.keycloakId) {
      const ok = await this.kcAdmin.deleteUser(user.keycloakId);
      if (!ok) {
        this.kcAdmin['logger'].warn(
          `Failed to delete user in Keycloak: ${user.keycloakId}`,
        );
      }
    }

    return this.prisma.user.delete({ where: { id } });
  }

  // 🔥 Listar sesiones activas desde Keycloak
  async listSessions(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.keycloakId) {
      throw new NotFoundException('User or KeycloakId not found');
    }
    return this.kcAdmin.listUserSessions(user.keycloakId);
  }

  // 🔥 Cerrar sesión remota
  async terminateSession(id: string, sessionId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.keycloakId) {
      throw new NotFoundException('User or KeycloakId not found');
    }
    const ok = await this.kcAdmin.deleteSession(sessionId);
    return { success: ok, sessionId };
  }
}
