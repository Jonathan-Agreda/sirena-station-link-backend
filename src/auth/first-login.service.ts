import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../data/prisma.service';
import { KeycloakAdminService } from './keycloak-admin.service';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
};

@Injectable()
export class FirstLoginService {
  private readonly log = new Logger(FirstLoginService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
    private readonly kcAdmin: KeycloakAdminService,
  ) {}

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
    const { data, status } = await axios.post<TokenResponse>(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });

    if (!data?.access_token) {
      throw Object.assign(new UnauthorizedException('invalid_grant'), {
        response: { status },
      });
    }
    return data;
  }

  // ---- Detecta si el error de KC es "required actions / update password"
  private isPasswordChangeRequired(e: any): boolean {
    const status = e?.response?.status ?? 400;
    return status === 400;
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
    const searchUrl = `${this.base}/admin/realms/${
      this.realm
    }/users?search=${encodeURIComponent(usernameOrEmail)}&exact=true`;
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

  // ---- Obtener username/email por ID (cuando el token no trae preferred_username)
  private async getUserUsernameById(
    userId: string,
  ): Promise<{ username?: string; email?: string }> {
    const token = await this.adminToken();
    const url = `${this.base}/admin/realms/${this.realm}/users/${userId}`;
    const { data } = await axios.get<any>(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { username: data?.username, email: data?.email };
  }

  // ---- Reset password permanente y limpia required actions
  private async setPermanentPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const token = await this.adminToken();

    const resetUrl = `${this.base}/admin/realms/${this.realm}/users/${userId}/reset-password`;
    await axios.put(
      resetUrl,
      { type: 'password', value: newPassword, temporary: false },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const userUrl = `${this.base}/admin/realms/${this.realm}/users/${userId}`;
    await axios.put(
      userUrl,
      { requiredActions: [] },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }

  // === API pública (existente) ===
  async prelogin(usernameOrEmail: string, password: string) {
    try {
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

  async sendForgotPasswordLink(email: string): Promise<void> {
    this.log.debug(
      `[Forgot Password] El servicio ha sido invocado para el email: ${email}`,
    );
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && user.keycloakId) {
      this.log.debug(
        `[Forgot Password] Usuario encontrado en DB. ID de Keycloak: ${user.keycloakId}`,
      );
      try {
        await this.kcAdmin.sendForgotPasswordEmail(user.keycloakId);
        this.log.debug(
          `[Forgot Password] La llamada a Keycloak para enviar el email a ${user.keycloakId} fue exitosa.`,
        );

        await this.mailService.sendForgotPasswordEmail({
          to: user.email,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          resetUrl: '', // Se deja vacío a propósito. El enlace real lo envía Keycloak.
        });
        this.log.debug(
          `[Forgot Password] Correo de notificación (plantilla interna) enviado a ${user.email}`,
        );
      } catch (error) {
        this.log.error(
          `[Forgot Password] FALLÓ la llamada a Keycloak para el email ${email}. Error:`,
          error,
        );
      }
    } else {
      this.log.warn(
        `[Forgot Password] Se solicitó reseteo, pero el email no fue encontrado o no tiene un ID de Keycloak asociado en la DB: ${email}`,
      );
    }
  }

  async completeFirstLogin(
    usernameOrEmail: string,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      await this.passwordGrant(usernameOrEmail, currentPassword);
    } catch (e) {
      if (!this.isPasswordChangeRequired(e)) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
    }

    const userId = await this.findUserId(usernameOrEmail);
    await this.setPermanentPassword(userId, newPassword);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
    });

    if (user?.email) {
      await this.mailService.sendFirstChangePasswordEmail({
        to: user.email,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        changeUrl: '',
      });
    }

    const tokens = await this.passwordGrant(usernameOrEmail, newPassword);
    return tokens;
  }

  // === API pública (NUEVO): cambio manual para usuario autenticado WEB ===
  async changePasswordForAuthenticatedUser(
    kcUser: any, // viene del token validado por tu AuthGuard
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const sub: string | undefined = kcUser?.sub;
    let username: string | undefined =
      kcUser?.preferred_username ||
      kcUser?.username ||
      kcUser?.email ||
      undefined;

    if (!username && sub) {
      const u = await this.getUserUsernameById(sub).catch(() => null);
      username = u?.username || u?.email || undefined;
    }

    if (!username) {
      throw new UnauthorizedException('Usuario inválido');
    }

    try {
      await this.passwordGrant(username, currentPassword);
    } catch {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const userId = sub ?? (await this.findUserId(username));
    await this.setPermanentPassword(userId, newPassword);
    const user = await this.prisma.user.findUnique({
      where: { keycloakId: sub },
    });
    if (user?.email) {
      await this.mailService.sendPasswordUpdatedEmail({
        to: user.email,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
      });
    }
  }
}
