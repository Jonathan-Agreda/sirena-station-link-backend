import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ActivationLogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.activationLog.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.GUARDIA)) {
      if (!user.urbanizationId) {
        throw new ForbiddenException('No urbanization linked');
      }
      return this.prisma.activationLog.findMany({
        where: { siren: { urbanizationId: user.urbanizationId } },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    if (user.roles.includes(Role.RESIDENTE)) {
      return this.prisma.activationLog.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    throw new ForbiddenException('Role not allowed');
  }

  async findBySiren(sirenId: string, user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.activationLog.findMany({
        where: { sirenId },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.GUARDIA)) {
      return this.prisma.activationLog.findMany({
        where: { sirenId, siren: { urbanizationId: user.urbanizationId } },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    if (user.roles.includes(Role.RESIDENTE)) {
      return this.prisma.activationLog.findMany({
        where: { sirenId, userId: user.sub },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    throw new ForbiddenException('Role not allowed');
  }

  async findByUser(userId: string, user: any) {
    if (user.roles.includes(Role.SUPERADMIN)) {
      return this.prisma.activationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    if (user.roles.includes(Role.ADMIN)) {
      return this.prisma.activationLog.findMany({
        where: { userId, siren: { urbanizationId: user.urbanizationId } },
        orderBy: { createdAt: 'desc' },
        include: { user: true, siren: true },
      });
    }

    throw new ForbiddenException('Role not allowed');
  }
}
