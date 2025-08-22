import { Injectable, Logger } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service';
import { AuditService } from './audit.service';

export type MinimalUser = {
  id?: string; // userId (UUID 'sub')
  username?: string;
  roles?: string[];
};

@Injectable()
export class SessionLimitService {
  private readonly logger = new Logger(SessionLimitService.name);

  constructor(
    private readonly kcAdmin: KeycloakAdminService,
    private readonly audit: AuditService,
  ) {}

  private maxSessionsFor(roles: string[] = []) {
    if (roles.includes('SUPERADMIN')) return 3;
    return 1; // ADMIN / GUARDIA / RESIDENTE
  }

  private async resolveUserId(user: MinimalUser): Promise<string | null> {
    if (user.id) return user.id;
    if (user.username) {
      const found = await this.kcAdmin.findUserByUsername(user.username);
      if (found?.id) return found.id;
    }
    return null;
  }

  /**
   * Enforce limit: mantiene la sesión 'keepSessionId' y revoca las más antiguas hasta quedar en el límite.
   */
  async enforce(user: MinimalUser, keepSessionId: string | undefined) {
    // 1) Resolver userId (UUID)
    const userId = await this.resolveUserId(user);
    if (!userId) {
      this.logger.warn(
        `No se pudo resolver userId para username=${user.username ?? '-'}; skip enforce`,
      );
      await this.audit.record({
        action: 'revocation',
        userId: user.id ?? '-',
        username: user.username,
        sessionId: keepSessionId,
        reason: 'user-not-found',
        by: 'system',
      });
      return;
    }

    // 2) Obtener sesiones y ordenar por lastAccess asc
    const sessions = await this.kcAdmin.listUserSessions(userId);
    if (!sessions.length) return;

    sessions.sort((a, b) => {
      const la = a.lastAccess ?? a.start ?? 0;
      const lb = b.lastAccess ?? b.start ?? 0;
      return la - lb;
    });

    const max = this.maxSessionsFor(user.roles ?? []);
    const total = sessions.length;
    if (total <= max) return;

    // 3) Filtra la sesión que queremos conservar (la nueva)
    const filtered = sessions.filter((s) => s.id !== keepSessionId);

    // 4) Matar las más antiguas hasta cumplir el límite
    let toKill = total - max;
    for (const s of filtered) {
      if (toKill <= 0) break;
      const ok = await this.kcAdmin.killSession(s.id);
      await this.audit.record({
        action: 'revocation',
        userId,
        username: user.username,
        sessionId: s.id,
        reason: `exceeds-limit(${max})`,
        by: 'system',
      });
      if (ok) toKill--;
    }
  }
}
