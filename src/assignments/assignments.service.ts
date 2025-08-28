import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.guard';

@Injectable()
export class AssignmentsService {
  constructor(private prisma: PrismaService) {}

  // Crear asignación (SUPERADMIN/ADMIN)
  async assign(userId: string, sirenId: string, currentUser: AuthUser) {
    // 🚨 Si es ADMIN, solo puede asignar dentro de su urbanización
    if (currentUser.roles.includes(Role.ADMIN)) {
      if (!currentUser.urbanizationId) {
        throw new ForbiddenException('Admin sin urbanización asignada');
      }

      const [siren, user] = await Promise.all([
        this.prisma.siren.findUnique({ where: { id: sirenId } }),
        this.prisma.user.findUnique({ where: { id: userId } }),
      ]);

      if (!siren || siren.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes asignar sirenas de otra urbanización',
        );
      }

      if (!user || user.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes asignar usuarios de otra urbanización',
        );
      }
    }

    return this.prisma.assignment.create({
      data: { userId, sirenId, active: true },
      include: { user: true, siren: true },
    });
  }

  // Quitar asignación (SUPERADMIN/ADMIN)
  async unassign(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.prisma.assignment.delete({ where: { id } });
  }

  // Listar asignaciones por usuario
  async findByUser(userId: string, currentUser: AuthUser) {
    // 👮‍♂️ Restricción: ADMIN solo su urbanización
    if (currentUser.roles.includes(Role.ADMIN)) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes ver asignaciones de otra urbanización',
        );
      }
    }

    return this.prisma.assignment.findMany({
      where: { userId, active: true },
      include: { siren: true },
    });
  }

  // Listar asignaciones por sirena
  async findBySiren(sirenId: string, currentUser: AuthUser) {
    if (currentUser.roles.includes(Role.ADMIN)) {
      const siren = await this.prisma.siren.findUnique({
        where: { id: sirenId },
      });
      if (!siren || siren.urbanizationId !== currentUser.urbanizationId) {
        throw new ForbiddenException(
          'No puedes ver asignaciones de otra urbanización',
        );
      }
    }

    return this.prisma.assignment.findMany({
      where: { sirenId, active: true },
      include: { user: true },
    });
  }
}
