import { Injectable, Logger } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service';
import { AuditService } from './audit.service';

export type MinimalUser = {
  id?: string; // sub (UUID de Keycloak)
  username?: string; // preferred_username
  roles?: string[];
};

function isValidUUID(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  if (s === '-' || s === 'undefined' || s === 'null') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    s,
  );
}

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
    // Aceptamos id SOLO si parece un UUID real
    if (isValidUUID(user.id)) return user.id!;

    // Si el id viene "-", "undefined", etc., intentamos por username/email
    if (user.username) {
      const found = await this.kcAdmin.findUserId(user.username);
      if (found?.id) return found.id;
    }
    return null;
  }

  /**
   * Mantiene la sesión 'keepSessionId' y revoca las más antiguas hasta cumplir el límite.
   */
  async enforce(user: MinimalUser, keepSessionId: string | undefined) {
    const userId = await this.resolveUserId(user);
    if (!userId) {
      this.logger.warn(
        `No se pudo resolver userId (id=${user.id ?? '-'} username=${user.username ?? '-'}) → skip enforce`,
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

    const sessions = await this.kcAdmin.listUserSessions(userId);
    if (!sessions.length) {
      this.logger.debug(`Sin sesiones activas para userId=${userId}`);
      return;
    }

    sessions.sort((a, b) => {
      const la = a.lastAccess ?? a.start ?? 0;
      const lb = b.lastAccess ?? b.start ?? 0;
      return la - lb;
    });

    const max = this.maxSessionsFor(user.roles ?? []);
    const total = sessions.length;
    this.logger.debug(`userId=${userId} total=${total} max=${max}`);

    if (total <= max) return;

    // Mantener la sesión nueva
    const filtered = sessions.filter((s) => s.id !== keepSessionId);

    // Matar antiguas hasta cumplir el límite
    let toKill = total - max;
    for (const s of filtered) {
      if (toKill <= 0) break;
      const ok = await this.kcAdmin.killSession(s.id);
      this.logger.debug(`killSession ${s.id} -> ${ok ? 'OK' : 'FAIL'}`);
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
