import { Injectable } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private kcAdmin: KeycloakAdminService, // 👈 Inyectamos Keycloak
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
    // 1. Crear en Keycloak
    const { id: keycloakId } = await this.kcAdmin.createUser({
      username: data.username,
      email: data.email,
      role: data.role,
      temporaryPassword: process.env.USER_DEFAULT_PASSWORD || 'changeme123', // configurable en .env
    });

    // 2. Guardar en BD
    return this.prisma.user.create({
      data: {
        ...data,
        keycloakId,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      username?: string;
      email?: string;
      role?: Role;
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    }>,
  ) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
