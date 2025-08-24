// src/devices/devices.service.ts
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida si el usuario tiene permiso para controlar una sirena
   * según su rol y pertenencia.
   */
  async validateAccess(user: any, deviceId: string): Promise<void> {
    const roles: string[] = (user.roles || []).map((r: string) =>
      r.toUpperCase(),
    );

    // SUPERADMIN → acceso total
    if (roles.includes('SUPERADMIN')) {
      this.logger.debug(`[validateAccess] SUPERADMIN acceso total`);
      return;
    }

    // Buscar sirena
    const siren = await this.prisma.siren.findUnique({
      where: { deviceId },
      include: {
        residents: true, // assignments
      },
    });

    if (!siren) {
      throw new ForbiddenException(`Siren ${deviceId} no existe`);
    }

    // Buscar usuario en BD
    const dbUser = await this.prisma.user.findUnique({
      where: { keycloakId: user.sub },
    });
    if (!dbUser) {
      throw new ForbiddenException('Usuario no registrado en BD');
    }

    // 🔹 enriquecer user para siguientes requests (útil en controllers)
    user.dbId = dbUser.id;
    user.urbanizationId = dbUser.urbanizationId;

    // ADMIN o GUARDIA → acceso solo si coincide urbanización
    if (roles.includes('ADMIN') || roles.includes('GUARDIA')) {
      if (
        dbUser.urbanizationId &&
        siren.urbanizationId === dbUser.urbanizationId
      ) {
        this.logger.debug(
          `[validateAccess] ${roles[0]} de urbanización ${dbUser.urbanizationId} controla siren ${deviceId}`,
        );
        return;
      }
      throw new ForbiddenException(
        `El ${roles[0]} no puede controlar sirenas de otra urbanización`,
      );
    }

    // RESIDENTE → acceso solo si tiene asignada la sirena
    if (roles.includes('RESIDENTE')) {
      const assigned = await this.prisma.assignment.findFirst({
        where: { userId: dbUser.id, sirenId: siren.id, active: true },
      });
      if (assigned) {
        this.logger.debug(
          `[validateAccess] RESIDENTE ${dbUser.id} controla siren ${deviceId}`,
        );
        return;
      }
      throw new ForbiddenException(
        `El residente no tiene acceso a la sirena ${deviceId}`,
      );
    }

    // Si no coincide ningún rol → acceso denegado
    throw new ForbiddenException('Rol no autorizado para enviar comandos');
  }
}
