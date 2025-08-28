import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  // 🔎 Listar grupos según rol
  async findAll(user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.group.findMany({
        include: { urbanization: true, sirens: true },
      });
    }

    if (
      user.roles.includes(Role.ADMIN) ||
      user.roles.includes(Role.GUARDIA) ||
      user.roles.includes(Role.RESIDENTE)
    ) {
      if (!user.urbanizationId) {
        throw new ForbiddenException('No urbanization linked to user');
      }
      return this.prisma.group.findMany({
        where: { urbanizationId: user.urbanizationId },
        include: { urbanization: true, sirens: true },
      });
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🔎 Obtener un grupo por ID
  async findOne(id: string, user: any) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: { urbanization: true, sirens: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    if (user.roles.includes(Role.SUPERADMIN)) return group;

    if (
      (user.roles.includes(Role.ADMIN) ||
        user.roles.includes(Role.GUARDIA) ||
        user.roles.includes(Role.RESIDENTE)) &&
      group.urbanizationId === user.urbanizationId
    ) {
      return group;
    }

    throw new ForbiddenException('Access denied');
  }

  // 🛠 Crear grupo
  async create(data: { name: string; urbanizationId: string }, user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.group.create({ data });
    }

    if (user.roles.includes(Role.ADMIN)) {
      if (!user.urbanizationId || user.urbanizationId !== data.urbanizationId) {
        throw new ForbiddenException(
          'No puedes crear grupos fuera de tu urbanización',
        );
      }
      return this.prisma.group.create({ data });
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🛠 Editar grupo
  async update(id: string, data: { name?: string }, user: any) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');

    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.group.update({ where: { id }, data });
    }

    if (user.roles.includes(Role.ADMIN)) {
      if (group.urbanizationId !== user.urbanizationId) {
        throw new ForbiddenException(
          'No puedes editar grupos de otra urbanización',
        );
      }
      return this.prisma.group.update({ where: { id }, data });
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 🗑 Eliminar grupo
  async remove(id: string, user: any) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');

    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.group.delete({ where: { id } });
    }

    if (user.roles.includes(Role.ADMIN)) {
      if (group.urbanizationId !== user.urbanizationId) {
        throw new ForbiddenException(
          'No puedes eliminar grupos de otra urbanización',
        );
      }
      return this.prisma.group.delete({ where: { id } });
    }

    throw new ForbiddenException('Role not allowed');
  }

  // 📋 Listar sirenas de un grupo
  async listSirens(groupId: string, user: any) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { sirens: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    if (user.roles.includes(Role.SUPERADMIN)) return group.sirens;

    if (
      (user.roles.includes(Role.ADMIN) ||
        user.roles.includes(Role.GUARDIA) ||
        user.roles.includes(Role.RESIDENTE)) &&
      group.urbanizationId === user.urbanizationId
    ) {
      return group.sirens;
    }

    throw new ForbiddenException('Access denied');
  }

  // ➕ Mover sirena a un grupo
  async addSirenToGroup(groupId: string, sirenId: string, user: any) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');

    const siren = await this.prisma.siren.findUnique({
      where: { id: sirenId },
    });
    if (!siren) throw new NotFoundException('Siren not found');

    if (siren.urbanizationId !== group.urbanizationId) {
      throw new ForbiddenException(
        'La sirena y el grupo deben ser de la misma urbanización',
      );
    }

    if (
      user.roles.includes(Role.SUPERADMIN) ||
      (user.roles.includes(Role.ADMIN) &&
        user.urbanizationId === group.urbanizationId)
    ) {
      return this.prisma.siren.update({
        where: { id: sirenId },
        data: { groupId },
        include: { group: true },
      });
    }

    throw new ForbiddenException('Access denied');
  }

  // ➖ Quitar sirena de un grupo
  async removeSirenFromGroup(sirenId: string, user: any) {
    const siren = await this.prisma.siren.findUnique({
      where: { id: sirenId },
    });
    if (!siren) throw new NotFoundException('Siren not found');

    if (
      user.roles.includes(Role.SUPERADMIN) ||
      (user.roles.includes(Role.ADMIN) &&
        user.urbanizationId === siren.urbanizationId)
    ) {
      return this.prisma.siren.update({
        where: { id: sirenId },
        data: { groupId: null },
        include: { group: true },
      });
    }

    throw new ForbiddenException('Access denied');
  }
}
