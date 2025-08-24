// src/devices/activation-log.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { ActivationAction, ActivationResult } from '@prisma/client';

export type ActivationEvent = {
  sirenId: string; // UUID de la sirena (Siren.id)
  userId?: string | null; // UUID de User en BD o null
  action: ActivationAction; // ON | OFF | AUTO_OFF
  result: ActivationResult; // ACCEPTED | REJECTED | FAILED
  reason?: string;
  ip?: string;
};

@Injectable()
export class ActivationLogService {
  private readonly logger = new Logger(ActivationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registrar un log de activación
   */
  async record(evt: ActivationEvent) {
    this.logger.log(
      `[ACTIVATION] siren=${evt.sirenId} user=${evt.userId ?? '-'} action=${evt.action} result=${evt.result} reason=${evt.reason ?? '-'}`,
    );

    try {
      await this.prisma.activationLog.create({
        data: {
          sirenId: evt.sirenId,
          userId: evt.userId ?? null,
          action: evt.action,
          result: evt.result,
          reason: evt.reason,
          ip: evt.ip,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Error guardando ActivationLog: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Obtener todos los logs (opcionalmente filtrados por userId)
   */
  async findAll(filter?: { userId?: string }) {
    return this.prisma.activationLog.findMany({
      where: { userId: filter?.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }

  /**
   * Obtener logs de una urbanización
   */
  async findByUrbanization(urbanizationId: string) {
    return this.prisma.activationLog.findMany({
      where: { siren: { urbanizationId } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }

  /**
   * Obtener logs de una sirena específica (por UUID)
   */
  async findBySiren(sirenId: string) {
    return this.prisma.activationLog.findMany({
      where: { sirenId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }

  /**
   * Obtener logs de una sirena específica filtrados por urbanización
   */
  async findBySirenAndUrbanization(sirenId: string, urbanizationId: string) {
    return this.prisma.activationLog.findMany({
      where: { sirenId, siren: { urbanizationId } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }
}
