import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { ActivationAction, ActivationResult } from '@prisma/client';

export type ActivationEvent = {
  sirenId: string;
  userId?: string | null;
  action: ActivationAction;
  result: ActivationResult;
  reason?: string;
  ip?: string;
};

@Injectable()
export class ActivationLogService {
  private readonly logger = new Logger(ActivationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registro genérico (ACCEPTED, REJECTED, FAILED, etc.)
   */
  async record(evt: ActivationEvent) {
    this.logger.log(
      `[ACTIVATION] siren=${evt.sirenId} user=${evt.userId ?? '-'} action=${
        evt.action
      } result=${evt.result} reason=${evt.reason ?? '-'}`,
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
   * Registro especializado para ACKs → EXECUTED
   */
  async recordExecuted(
    sirenId: string,
    commandId: string,
    action: ActivationAction,
  ) {
    try {
      await this.prisma.activationLog.create({
        data: {
          sirenId,
          userId: null, // normalmente el ACK no viene con user
          action,
          result: ActivationResult.EXECUTED,
          reason: `ACK commandId=${commandId}`,
          ip: 'device',
        },
      });

      this.logger.log(
        `[ACTIVATION] siren=${sirenId} action=${action} result=EXECUTED (ACK ${commandId})`,
      );
    } catch (err: any) {
      this.logger.error(
        `Error guardando ActivationLog EXECUTED: ${err.message}`,
        err.stack,
      );
    }
  }

  // === Consultas ===

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

  async findByUrbanizationAndUser(urbanizationId: string, userId: string) {
    return this.prisma.activationLog.findMany({
      where: { userId, siren: { urbanizationId } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }

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

  async findBySirenAndUser(sirenId: string, userId: string) {
    return this.prisma.activationLog.findMany({
      where: { sirenId, userId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }

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

  async findBySirenAndUrbanizationAndUser(
    sirenId: string,
    urbanizationId: string,
    userId: string,
  ) {
    return this.prisma.activationLog.findMany({
      where: { sirenId, userId, siren: { urbanizationId } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        siren: { select: { id: true, deviceId: true, urbanizationId: true } },
      },
    });
  }
}
