import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
};

/**
 * Servicio encapsulado para:
 *  - Probar credenciales contra Keycloak (password grant)
 *  - Detectar "required actions" (UPDATE_PASSWORD)
 *  - Cambiar la contraseña con el Admin API (service account)
 *  - Hacer login con la nueva clave y devolver tokens
 *
 * 👉 NO toca tu OidcService/KeycloakAdminService existentes, para no romper nada.
 */
@Injectable()
export class FirstLoginService {
  private readonly log = new Logger(FirstLoginService.name);

  constructor(private readonly cfg: ConfigService) {}

  // ---- Helpers de configuración
  private get base(): string {
    const u =
      this.cfg.get<string>('KEYCLOAK_BASE_URL') ?? 'http://localhost:8080';
    return u.replace(/\/+$/, '');
  }
  private get realm(): string {
    return this.cfg.get<string>('KEYCLOAK_REALM') ?? 'alarma';
  }
  private get backendClientId(): string {
    // service-account con realm-management:realm-admin
    return (
      this.cfg.get<string>('KEYCLOAK_ADMIN_CLIENT_ID') ??
      this.cfg.get<string>('KEYCLOAK_CLIENT_ID') ??
      'backend-api'
    );
  }
  private get backendClientSecret(): string {
    const s =
      this.cfg.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET') ??
      this.cfg.get<string>('KEYCLOAK_CLIENT_SECRET');
    if (!s)
      throw new Error(
        'Falta KEYCLOAK_ADMIN_CLIENT_SECRET (o KEYCLOAK_CLIENT_SECRET) en .env',
      );
    return s;
  }

  // ---- Password grant contra Keycloak (para probar login)
  private async passwordGrant(
    username: string,
    password: string,
  ): Promise<TokenResponse> {
    const url = `${this.base}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.backendClientId,
      client_secret: this.backendClientSecret,
      username,
      password,
    });
    const { data } = await axios.post<TokenResponse>(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });

    // Si viene error (400) lo devolvemos como throw con más contexto
    if (!(data as any)?.access_token) {
      const err = data as any;
      throw Object.assign(new UnauthorizedException('invalid_grant'), {
        kcError: err,
      });
    }
    return data;
  }

  // ---- Detecta si el error de KC es "required actions / update password"
  private isPasswordChangeRequired(e: any): boolean {
    const kc = e?.kcError || e?.response?.data || {};
    const status = e?.response?.status ?? 400;
    const err = String(kc?.error || '');
    const desc = String(kc?.error_description || '');

    // Keycloak suele responder: 400 invalid_grant + "Account is not fully set up" o "Action required"
    return (
      status === 400 &&
      err.includes('invalid_grant') &&
      /action required|account is not fully set up|user action required/i.test(
        desc,
      )
    );
  }

  // ---- Token de service-account (client_credentials) para Admin API
  private async adminToken(): Promise<string> {
    const url = `${this.base}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.backendClientId,
      client_secret: this.backendClientSecret,
    });
    const { data } = await axios.post<TokenResponse>(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data.access_token;
  }

  // ---- Buscar usuario en KC por username o email
  private async findUserId(usernameOrEmail: string): Promise<string> {
    const token = await this.adminToken();
    const searchUrl = `${this.base}/admin/realms/${this.realm}/users?search=${encodeURIComponent(usernameOrEmail)}&exact=true`;
    const { data } = await axios.get<any[]>(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const found =
      data.find(
        (u) => u.username?.toLowerCase() === usernameOrEmail.toLowerCase(),
      ) ||
      data.find(
        (u) => u.email?.toLowerCase() === usernameOrEmail.toLowerCase(),
      ) ||
      data[0];

    if (!found?.id)
      throw new NotFoundException('Usuario no encontrado en Keycloak');
    return found.id;
  }

  // ---- Reset password permanente y limpia required actions
  private async setPermanentPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const token = await this.adminToken();

    // 1) reset password
    const resetUrl = `${this.base}/admin/realms/${this.realm}/users/${userId}/reset-password`;
    await axios.put(
      resetUrl,
      { type: 'password', value: newPassword, temporary: false },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // 2) limpiar required actions (por si quedó UPDATE_PASSWORD)
    const userUrl = `${this.base}/admin/realms/${this.realm}/users/${userId}`;
    await axios.put(
      userUrl,
      { requiredActions: [] },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }

  // === API pública ===

  /**
   * Prelogin: prueba las credenciales.
   * - OK → { ok: true }
   * - PASSWORD_CHANGE_REQUIRED → { ok: false, code: 'PASSWORD_CHANGE_REQUIRED' }
   * - Credenciales inválidas → 401
   */
  async prelogin(usernameOrEmail: string, password: string) {
    try {
      // Si entra, no hay required actions
      await this.passwordGrant(usernameOrEmail, password);
      return { ok: true as const };
    } catch (e) {
      if (this.isPasswordChangeRequired(e)) {
        return {
          ok: false as const,
          code: 'PASSWORD_CHANGE_REQUIRED' as const,
        };
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }
  }

  /**
   * Completa primer login:
   * - Verifica que efectivamente KC está pidiendo cambio de clave
   * - Setea nueva clave permanente y limpia requiredActions
   * - Devuelve tokens con la nueva clave
   */
  async completeFirstLogin(
    usernameOrEmail: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // 1) Confirmar que la clave actual es válida pero requiere UPDATE_PASSWORD
    try {
      await this.passwordGrant(usernameOrEmail, currentPassword);
      // Si NO lanzó error → no hacía falta cambio; pero continuamos igual y seteamos nueva clave
    } catch (e) {
      if (!this.isPasswordChangeRequired(e)) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
    }

    // 2) Cambiar clave en KC (permanente) y limpiar required actions
    const userId = await this.findUserId(usernameOrEmail);
    await this.setPermanentPassword(userId, newPassword);

    // 3) Login con la nueva clave → devolver tokens
    const tokens = await this.passwordGrant(usernameOrEmail, newPassword);
    return tokens;
  }
}
