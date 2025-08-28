import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';

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
}
