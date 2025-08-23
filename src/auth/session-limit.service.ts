import { Injectable, Logger } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service';
import { AuditService } from './audit.service';
import { PrismaService } from '../data/prisma.service';

export type MinimalUser = {
  id?: string; // sub (UUID de Keycloak)
  username?: string; // preferred_username
  roles?: string[]; // roles del token
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
    private readonly prisma: PrismaService,
  ) {}

  /** Lee override de sesiones desde BD; si no hay, aplica política por rol. */
  private async maxSessionsFor(
    userId: string,
    roles: string[] = [],
  ): Promise<number> {
    try {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { sessionLimit: true },
      });

      if (dbUser?.sessionLimit !== null && dbUser?.sessionLimit !== undefined) {
        return dbUser.sessionLimit;
      }
    } catch (e) {
      this.logger.warn(
        `No se pudo leer sessionLimit para userId=${userId}: ${e?.message ?? e}`,
      );
    }

    if (roles.includes('SUPERADMIN')) return 3;
    return 1;
  }

  /** Acepta UUID directo o resuelve por username/email vía Keycloak Admin. */
  private async resolveUserId(user: MinimalUser): Promise<string | null> {
    if (isValidUUID(user.id)) return user.id!;
    if (user.username) {
      const found = await this.kcAdmin.findUserId(user.username);
      if (found?.id) return found.id;
    }
    return null;
  }

  /**
   * Mantiene la sesión `keepSessionId` (si se pasa) y revoca las más antiguas
   * hasta cumplir el límite calculado para el usuario.
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

    // 1) Listar sesiones actuales en KC
    let sessions: Array<{ id: string; start?: number; lastAccess?: number }> =
      [];
    try {
      sessions = await this.kcAdmin.listUserSessions(userId);
    } catch (e: any) {
      const msg = e?.response?.data
        ? JSON.stringify(e.response.data)
        : (e?.message ?? String(e));
      this.logger.warn(
        `[Keycloak] listUserSessions falló para userId=${userId}: ${msg}`,
      );
      return; // no revocamos nada si no podemos listar
    }

    if (!sessions?.length) {
      this.logger.debug(`Sin sesiones activas para userId=${userId}`);
      return;
    }

    // 2) Ordenar por actividad (más recientes primero)
    sessions.sort((a, b) => {
      const la = a.lastAccess ?? a.start ?? 0;
      const lb = b.lastAccess ?? b.start ?? 0;
      return lb - la;
    });

    // 3) Calcular límite
    const max = await this.maxSessionsFor(userId, user.roles ?? []);
    const total = sessions.length;
    this.logger.debug(`userId=${userId} total=${total} max=${max}`);

    if (total <= max) return;

    // 4) Filtrar candidatos a eliminar (excluyendo la sesión actual)
    const candidates = keepSessionId
      ? sessions.filter((s) => s.id !== keepSessionId)
      : sessions;

    // 5) Revocar los más antiguos hasta cumplir el límite
    let toKill = total - max;
    for (const s of candidates.reverse()) {
      // reverse → empezamos por los más antiguos
      if (toKill <= 0) break;

      let ok = false;
      try {
        ok = await this.kcAdmin.deleteSession(s.id);
      } catch (e: any) {
        const msg = e?.response?.data
          ? JSON.stringify(e.response.data)
          : (e?.message ?? String(e));
        this.logger.warn(`[Keycloak] deleteSession ${s.id} falló: ${msg}`);
      }

      this.logger.debug(`deleteSession ${s.id} -> ${ok ? 'OK' : 'FAIL'}`);

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
