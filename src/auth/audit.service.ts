import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';
import { AuditAction } from '@prisma/client';

export type AuditEvent = {
  action: 'login' | 'logout' | 'revocation';
  userId?: string; // Puede venir como id interno o como keycloakId
  username?: string;
  sessionId?: string;
  reason?: string;
  by?: 'system' | 'user' | 'admin';
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(evt: AuditEvent) {
    // 1. Log en consola
    this.logger.log(
      `[AUDIT] ${evt.action} uid=${evt.userId ?? '-'} sid=${
        evt.sessionId ?? '-'
      } reason=${evt.reason ?? '-'}`,
    );

    try {
      let userIdToSave: string | null = null;

      if (evt.userId && evt.userId !== '-') {
        // Primero intentamos como id interno
        const exists = await this.prisma.user.findUnique({
          where: { id: evt.userId },
          select: { id: true },
        });

        if (exists) {
          userIdToSave = exists.id;
        } else {
          // Si no existe, intentamos como keycloakId
          const byKeycloak = await this.prisma.user.findUnique({
            where: { keycloakId: evt.userId },
            select: { id: true },
          });
          if (byKeycloak) {
            userIdToSave = byKeycloak.id; // mapeamos al id interno (ej: user-001)
          }
        }
      }

      // 2. Persistir en Prisma
      await this.prisma.auditLog.create({
        data: {
          action: evt.action as AuditAction,
          userId: userIdToSave, // ahora sí es el id interno si existe
          username: evt.username,
          sessionId: evt.sessionId,
          reason: evt.reason,
          by: evt.by,
          ip: evt.ip,
          userAgent: evt.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(`Error guardando AuditLog: ${err.message}`, err.stack);
    }
  }
}
