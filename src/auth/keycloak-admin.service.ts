// src/auth/keycloak-admin.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { URLSearchParams } from 'url';

type KCUser = { id: string; username: string; email?: string };
export type KCUserSession = {
  id: string;
  username?: string;
  userId: string;
  ipAddress?: string;
  start?: number;
  lastAccess?: number;
  clients?: Record<string, string>;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type RoleRepresentation = { id: string; name: string };

// 👇 Tipo único para updates de usuario
export type KCUserUpdate = {
  username?: string;
  email?: string;
  enabled?: boolean;
  firstName?: string;
  lastName?: string;
};

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private http!: AxiosInstance;

  private adminToken?: { value: string; expiresAt: number };

  private realm() {
    return process.env.KEYCLOAK_REALM || 'alarma';
  }
  private base() {
    const url = process.env.KEYCLOAK_BASE_URL;
    if (!url) throw new Error('KEYCLOAK_BASE_URL is required');
    return url.replace(/\/+$/, '');
  }
  private adminBase() {
    return `${this.base()}/admin/realms/${this.realm()}`;
  }
  private tokenUrl() {
    return `${this.base()}/realms/${this.realm()}/protocol/openid-connect/token`;
  }
  private adminClientId() {
    return process.env.KEYCLOAK_CLIENT_ID || 'backend-api';
  }
  private adminClientSecret() {
    const secret = process.env.KEYCLOAK_CLIENT_SECRET || '';
    this.logger.debug(`Using Client Secret: [REDACTED len=${secret.length}]`);
    return secret;
  }

  private isTokenValid() {
    return this.adminToken && Date.now() < this.adminToken.expiresAt - 5_000;
  }

  private async fetchAdminToken(): Promise<string> {
    const form = new URLSearchParams();
    form.set('grant_type', 'client_credentials');
    form.set('client_id', this.adminClientId());
    form.set('client_secret', this.adminClientSecret());

    const res = await axios.post<TokenResponse>(this.tokenUrl(), form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
      validateStatus: () => true,
    });

    if (res.status < 200 || res.status >= 300) {
      this.logger.error(
        `Admin token error ${res.status}: ${JSON.stringify(res.data)}`,
      );
      throw new UnauthorizedException('Keycloak admin token error');
    }

    const expiresAt = Date.now() + res.data.expires_in * 1000;
    this.adminToken = { value: res.data.access_token, expiresAt };
    return res.data.access_token;
  }

  private async getAdminToken(): Promise<string> {
    if (this.isTokenValid()) return this.adminToken!.value;
    return this.fetchAdminToken();
  }

  private async client(): Promise<AxiosInstance> {
    const token = await this.getAdminToken();
    if (!this.http) {
      this.http = axios.create({
        baseURL: this.adminBase(),
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      this.http.defaults.baseURL = this.adminBase();
      this.http.defaults.headers.Authorization = `Bearer ${token}`;
    }
    return this.http;
  }

  /* -------------------- Usuarios -------------------- */
  async findUserId(usernameOrEmail: string): Promise<KCUser | null> {
    const http = await this.client();
    const urlUser = `/users?username=${encodeURIComponent(usernameOrEmail)}&exact=true`;
    let res = await http.get(urlUser, { validateStatus: () => true });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0] as KCUser;
    }

    const urlEmail = `/users?email=${encodeURIComponent(usernameOrEmail)}&exact=true`;
    res = await http.get(urlEmail, { validateStatus: () => true });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0] as KCUser;
    }

    this.logger.warn(`findUserId ${res.status}: ${JSON.stringify(res.data)}`);
    return null;
  }

  async updateUserProfile(
    userId: string,
    data: KCUserUpdate,
  ): Promise<boolean> {
    const http = await this.client();
    const body: Record<string, unknown> = {};
    if (data.username !== undefined) body.username = data.username;
    if (data.email !== undefined) body.email = data.email;
    if (data.enabled !== undefined) body.enabled = data.enabled;
    if (data.firstName !== undefined) body.firstName = data.firstName;
    if (data.lastName !== undefined) body.lastName = data.lastName;

    if (Object.keys(body).length === 0) return true;

    const res = await http.put(`/users/${userId}`, body, {
      validateStatus: () => true,
    });

    if (!(res.status >= 200 && res.status < 300)) {
      this.logger.error(
        `updateUserProfile error ${res.status}: ${JSON.stringify(res.data)}`,
      );
      return false;
    }
    return true;
  }

  // ✨ Nuevo alias más intuitivo
  async updateUser(userId: string, data: KCUserUpdate): Promise<boolean> {
    return this.updateUserProfile(userId, data);
  }

  /* -------------------- Sesiones -------------------- */
  async listUserSessions(userId: string): Promise<KCUserSession[]> {
    const http = await this.client();
    const res = await http.get(`/users/${userId}/sessions`, {
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      this.logger.warn(
        `listUserSessions ${res.status}: ${JSON.stringify(res.data)}`,
      );
      return [];
    }
    return res.data as KCUserSession[];
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const http = await this.client();
    const res = await http.delete(`/sessions/${sessionId}`, {
      validateStatus: () => true,
    });
    if (!(res.status >= 200 && res.status < 300)) {
      this.logger.warn(
        `deleteSession ${res.status}: ${JSON.stringify(res.data)}`,
      );
    }
    return res.status >= 200 && res.status < 300;
  }

  async logoutUserAll(userId: string): Promise<boolean> {
    const http = await this.client();
    const res = await http.post(`/users/${userId}/logout`, null, {
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  async revokeConsentForClient(
    userId: string,
    clientId: string,
  ): Promise<boolean> {
    const http = await this.client();
    const res = await http.delete(`/users/${userId}/consents/${clientId}`, {
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  /* -------------------- Roles -------------------- */
  async assignRealmRole(userId: string, roleName: string) {
    const http = await this.client();
    const { data: role } = await http.get(`/roles/${roleName}`, {
      validateStatus: () => true,
    });

    const res = await http.post(
      `/users/${userId}/role-mappings/realm`,
      [role],
      { validateStatus: () => true },
    );

    if (!(res.status >= 200 && res.status < 300)) {
      this.logger.error(
        `assignRealmRole error ${res.status}: ${JSON.stringify(res.data)}`,
      );
    }
  }

  async getRoleByName(roleName: string): Promise<RoleRepresentation> {
    const http = await this.client();
    const { data, status } = await http.get(`/roles/${roleName}`, {
      validateStatus: () => true,
    });
    if (status !== 200) {
      throw new Error(`getRoleByName ${status}: ${JSON.stringify(data)}`);
    }
    return data as RoleRepresentation;
  }

  async getUserRealmRoles(userId: string): Promise<RoleRepresentation[]> {
    const http = await this.client();
    const { data, status } = await http.get(
      `/users/${userId}/role-mappings/realm`,
      { validateStatus: () => true },
    );
    if (status !== 200) {
      this.logger.error(`getUserRealmRoles ${status}: ${JSON.stringify(data)}`);
      return [];
    }
    return data as RoleRepresentation[];
  }

  async replaceRealmRole(userId: string, newRoleName: string) {
    const http = await this.client();
    const current = await this.getUserRealmRoles(userId);
    const managed = ['SUPERADMIN', 'ADMIN', 'GUARDIA', 'RESIDENTE'];
    const toRemove = current.filter((r) => managed.includes(r.name));

    if (toRemove.length) {
      const del = await http.delete(`/users/${userId}/role-mappings/realm`, {
        data: toRemove,
        validateStatus: () => true,
      });
      if (!(del.status >= 200 && del.status < 300)) {
        this.logger.error(
          `replaceRealmRole(delete) ${del.status}: ${JSON.stringify(del.data)}`,
        );
        throw new Error('Keycloak remove roles failed');
      }
    }

    await this.assignRealmRole(userId, newRoleName);
  }

  /* -------------------- CRUD básico -------------------- */
  async createUser(opts: {
    username: string;
    email: string;
    role: string;
    temporaryPassword?: string;
  }): Promise<{ id: string }> {
    const http = await this.client();
    const res = await http.post(
      `/users`,
      {
        username: opts.username,
        email: opts.email,
        enabled: true,
        credentials: opts.temporaryPassword
          ? [
              {
                type: 'password',
                value: opts.temporaryPassword,
                temporary: true,
              },
            ]
          : undefined,
      },
      { validateStatus: () => true },
    );

    if (!(res.status === 201 || res.status === 204)) {
      this.logger.error(
        `createUser error ${res.status}: ${JSON.stringify(res.data)}`,
      );
      throw new Error('Keycloak createUser failed');
    }

    const location = res.headers['location'] as string;
    const id = location?.split('/').pop();
    if (!id) throw new Error('Keycloak createUser: no Location/ID');

    await this.assignRealmRole(id, opts.role);
    return { id };
  }

  async deleteUser(userId: string): Promise<boolean> {
    const http = await this.client();
    const res = await http.delete(`/users/${userId}`, {
      validateStatus: () => true,
    });
    if (!(res.status >= 200 && res.status < 300)) {
      this.logger.error(
        `deleteUser error ${res.status}: ${JSON.stringify(res.data)}`,
      );
      return false;
    }
    return true;
  }
}
