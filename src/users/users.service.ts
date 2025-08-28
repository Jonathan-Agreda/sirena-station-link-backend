import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private kcAdmin: KeycloakAdminService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({ include: { urbanization: true } });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { urbanization: true },
    });
  }

  // Alta: primero KC, luego BD
  async create(data: {
    username: string;
    email: string;
    role: Role;
    urbanizationId?: string;
    etapa?: string;
    manzana?: string;
    villa?: string;
    alicuota?: boolean;
  }) {
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username: data.username,
      email: data.email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123',
    });

    return this.prisma.user.create({
      data: {
        ...data,
        keycloakId,
      },
    });
  }

  // Update: sincronizado con Keycloak
  async update(
    id: string,
    data: Partial<{
      email: string; // ✅ solo email se sincroniza en Keycloak
      role: Role; // ✅ role se sincroniza en Keycloak
      etapa: string;
      manzana: string;
      villa: string;
      alicuota: boolean;
      urbanizationId: string;
      sessionLimit: number | null;
    }>,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // 1. Actualizar email en Keycloak
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

  // Delete: primero KC, luego BD
  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

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
