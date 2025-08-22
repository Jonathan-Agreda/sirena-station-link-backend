import { Injectable, Logger } from '@nestjs/common';

export type AuditEvent = {
  action: 'login' | 'logout' | 'revocation';
  userId: string;
  username?: string;
  sessionId?: string;
  reason?: string;
  by?: 'system' | 'user';
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async record(evt: AuditEvent) {
    // Parte 2/2: persistir en Prisma (tabla AuthAudit).
    this.logger.log(
      `[AUDIT] ${evt.action} uid=${evt.userId} sid=${evt.sessionId ?? '-'} reason=${evt.reason ?? '-'}`,
    );
  }
}
