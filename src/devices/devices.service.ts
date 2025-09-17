import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buscar sirena por deviceId (devuelve null si no existe)
   */
  async findByDeviceId(deviceId: string) {
    return this.prisma.siren.findUnique({
      where: { deviceId },
      include: { residents: true },
    });
  }

  /**
   * Buscar usuario por KeycloakId
   */
  async findUserByKeycloakId(sub: string) {
    return this.prisma.user.findUnique({ where: { keycloakId: sub } });
  }

  /**
   * Buscar urbanización por ID (método público para controller)
   */
  async findUrbanizationById(id: string) {
    return this.prisma.urbanization.findUnique({ where: { id } });
  }

  /**
   * Valida si el usuario tiene permiso para controlar una sirena
   * según su rol y pertenencia.
   */
  async validateAccess(user: any, deviceId: string): Promise<void> {
    const roles: string[] = (user.roles || []).map((r: string) =>
      r.toUpperCase(),
    );

    // 🔹 Siempre buscamos el usuario en BD para asignar dbId
    const dbUser = await this.findUserByKeycloakId(user.sub);
    if (!dbUser) {
      throw new ForbiddenException('Usuario no registrado en BD');
    }
    user.dbId = dbUser.id;
    user.urbanizationId = dbUser.urbanizationId;

    // SUPERADMIN → acceso total (pero ya con dbId seteado)
    if (roles.includes('SUPERADMIN')) {
      this.logger.debug(
        `[validateAccess] SUPERADMIN ${dbUser.id} acceso total`,
      );
      return;
    }

    // Buscar sirena
    const siren = await this.findByDeviceId(deviceId);
    if (!siren) {
      throw new ForbiddenException(`Siren ${deviceId} no existe`);
    }

    // ADMIN o GUARDIA → misma urbanización
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

    // RESIDENTE → debe tener asignada la sirena
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

    throw new ForbiddenException('Rol no autorizado para enviar comandos');
  }
}
