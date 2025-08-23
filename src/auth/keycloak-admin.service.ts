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
    // AÑADE ESTA LÍNEA PARA DEPURAR
    this.logger.debug(
      `Using Client Secret: '${process.env.KEYCLOAK_CLIENT_SECRET}'`,
    );
    return process.env.KEYCLOAK_CLIENT_SECRET || '';
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
}
