import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { UpdateMyContactDto } from './dto/update-my-contact.dto';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { MailService } from '../mail/mail.service';

@Controller('residents')
@UseGuards(AuthGuard, RolesGuard)
export class ResidentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kcAdmin: KeycloakAdminService,
    private readonly mailService: MailService,
  ) {}

  /* ------------------------- Perfil actual ------------------------- */
  @Get('me')
  @Roles('RESIDENTE', 'ADMIN', 'GUARDIA', 'SUPERADMIN')
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
      sirens,
      cedula: user.cedula,
      celular: user.celular,
      telegramChatId: user.telegramChatId,
    };
  }

  /* ----------------- Actualizar contacto propio ----------------- */
  @Put('me/contact')
  @Roles('RESIDENTE', 'ADMIN', 'GUARDIA', 'SUPERADMIN')
  async updateMyContact(@Body() dto: UpdateMyContactDto, @Req() req: Request) {
    const sub = req.user?.sub as string;

    const current = await this.prisma.user.findUnique({
      where: { keycloakId: sub },
    });

    if (!current) throw new NotFoundException('Usuario no encontrado');

    const data: {
      email?: string;
      cedula?: string | null;
      celular?: string | null;
    } = {};

    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.cedula !== undefined)
      data.cedula = dto.cedula ? dto.cedula.trim() : null;
    if (dto.celular !== undefined)
      data.celular = dto.celular ? dto.celular.trim() : null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay cambios para actualizar');
    }

    if (data.cedula && data.cedula !== current.cedula) {
      const exists = await this.prisma.user.findFirst({
        where: { cedula: data.cedula, id: { not: current.id } },
      });
      if (exists) throw new BadRequestException('La cédula ya está registrada');
    }

    // 🔹 Si cambia el email, primero sincronizar con Keycloak
    if (data.email && data.email !== current.email) {
      try {
        await this.kcAdmin.updateUser(current.keycloakId as string, {
          email: data.email,
          // 🔑 aseguramos string válido, si viene null lo mandamos como undefined
          username: current.username ?? undefined,
        });
      } catch (err) {
        throw new InternalServerErrorException(
          'No se pudo sincronizar email con Keycloak',
        );
      }
    }

    // 🔹 Guardar cambios en Prisma
    const updated = await this.prisma.user.update({
      where: { id: current.id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        cedula: true,
        celular: true,
        updatedAt: true,
      },
    });
    if (updated.email) {
      await this.mailService.sendProfileUpdatedEmail({
        to: updated.email,
        name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim(),
      });
    }

    return { ok: true, user: updated };
  }
}
