import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../data/prisma.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { randomBytes } from 'crypto';

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

  private isPasswordChangeRequired(e: any): boolean {
    const status = e?.response?.status ?? 400;
    return status === 400;
  }

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

  // 👇 MÉTODO MODIFICADO
  async sendForgotPasswordLink(email: string): Promise<void> {
    this.log.debug(`[Forgot Password] Solicitud para el email: ${email}`);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      this.log.debug(
        `[Forgot Password] Usuario encontrado en DB. ID: ${user.id}`,
      );

      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hora de validez

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
          passwordResetExpires: expires,
        },
      });
      this.log.debug(
        `[Forgot Password] Token de reseteo generado y guardado para el usuario ${user.id}`,
      );

      const resetUrl = `${this.cfg.get('APP_LOGIN_URL').replace('/login', '')}/reset-password?token=${token}`;

      await this.mailService.sendForgotPasswordEmail({
        to: user.email,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        resetUrl: resetUrl,
      });
      this.log.debug(
        `[Forgot Password] Email enviado a ${user.email} con la URL de reseteo.`,
      );
    } else {
      this.log.warn(
        `[Forgot Password] Se solicitó reseteo para un email no registrado: ${email}`,
      );
    }
  }

  // 👇 NUEVO MÉTODO AÑADIDO
  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      this.log.warn(
        `[Reset Password] Se intentó usar un token inválido o expirado: ${token.substring(0, 10)}...`,
      );
      throw new BadRequestException(
        'El token de restablecimiento es inválido o ha expirado.',
      );
    }

    if (!user.keycloakId) {
      this.log.error(
        `[Reset Password] El usuario ${user.id} tiene un token válido pero no un keycloakId.`,
      );
      throw new BadRequestException(
        'La cuenta no está vinculada a un proveedor de identidad.',
      );
    }

    this.log.debug(
      `[Reset Password] Token válido para el usuario ${user.id}. Actualizando contraseña en Keycloak.`,
    );

    await this.setPermanentPassword(user.keycloakId, newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    this.log.debug(
      `[Reset Password] Contraseña actualizada y token limpiado para el usuario ${user.id}.`,
    );
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

  async changePasswordForAuthenticatedUser(
    kcUser: any,
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
