import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import type { Request } from 'express';

@Controller('residents')
@UseGuards(AuthGuard, RolesGuard)
export class ResidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @Roles(Role.RESIDENTE, Role.ADMIN, Role.GUARDIA, Role.SUPERADMIN)
  async me(@Req() req: Request) {
    const sub = req.user?.sub as string; // UUID de Keycloak

    const user = await this.prisma.user.findUnique({
      where: { keycloakId: sub },
      include: {
        urbanization: true,
        assignments: {
          where: { active: true },
          include: {
            siren: { include: { urbanization: true } },
          },
        },
      },
    });

    if (!user) return { error: 'Usuario no encontrado' };

    // 🔹 Convertir assignments → array de sirens
    const sirens = user.assignments.map((a) => a.siren);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      etapa: user.etapa,
      manzana: user.manzana,
      villa: user.villa,
      alicuota: user.alicuota,
      urbanizacion: user.urbanization,
      sirens, // 🔹 ahora es un array
    };
  }
}
