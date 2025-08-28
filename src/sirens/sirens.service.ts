import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';

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
              userId: user.userId, // ✅ usar ID interno, no sub
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
        (a) => a.userId === user.userId && a.active, // ✅ comprobar con userId
      );
      if (!assigned) throw new ForbiddenException('Access denied');
      return siren;
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🛠 Crear sirena (solo SUPERADMIN; se valida en el controller)
  async create(data: {
    deviceId: string;
    apiKey: string;
    urbanizationId: string;
    lat?: number;
    lng?: number;
  }) {
    return this.prisma.siren.create({ data });
  }

  // 🛠 Editar sirena (solo SUPERADMIN; se valida en el controller)
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

    return this.prisma.siren.update({
      where: { id },
      data,
    });
  }

  // 🛠 Eliminar sirena (solo SUPERADMIN; se valida en el controller)
  async remove(id: string) {
    const siren = await this.prisma.siren.findUnique({ where: { id } });
    if (!siren) throw new NotFoundException('Siren not found');

    return this.prisma.siren.delete({ where: { id } });
  }
}
