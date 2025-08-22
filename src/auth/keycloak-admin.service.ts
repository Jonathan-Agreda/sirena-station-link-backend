import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { URLSearchParams } from 'url';

type KCUser = { id: string; username: string; email?: string };
type KCUserSession = {
  id: string;
  username?: string;
  userId: string;
  ipAddress?: string;
  start?: number; // epoch ms
  lastAccess?: number; // epoch ms
  clients?: Record<string, string>;
};

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  private realm() {
    return process.env.KEYCLOAK_REALM || 'alarma';
  }
  private base() {
    const url = process.env.KEYCLOAK_BASE_URL;
    if (!url) throw new Error('KEYCLOAK_BASE_URL is required');
    return url;
  }
  private adminBase() {
    return `${this.base()}/admin/realms/${this.realm()}`;
  }

  private async getAdminToken(): Promise<string> {
    const tokenUrl = `${this.base()}/realms/${this.realm()}/protocol/openid-connect/token`;
    const client_id = process.env.KEYCLOAK_CLIENT_ID || 'backend-api';
    const client_secret = process.env.KEYCLOAK_CLIENT_SECRET || '';
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id,
      client_secret,
    });
    const res = await axios.post(tokenUrl, form, {
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
    return res.data.access_token as string;
  }

  /** Busca usuario por username exacto y devuelve su UUID (id). */
  async findUserByUsername(username: string): Promise<KCUser | null> {
    const token = await this.getAdminToken();
    const url = `${this.adminBase()}/users?username=${encodeURIComponent(username)}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      this.logger.warn(
        `findUserByUsername ${res.status}: ${JSON.stringify(res.data)}`,
      );
      return null;
    }
    const arr = res.data as KCUser[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // Keycloak devuelve coincidencia exacta en [0] si existe
    return arr[0];
  }

  async listUserSessions(userId: string): Promise<KCUserSession[]> {
    const token = await this.getAdminToken();
    const url = `${this.adminBase()}/users/${userId}/sessions`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
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

  async killSession(sessionId: string): Promise<boolean> {
    const token = await this.getAdminToken();
    const url = `${this.adminBase()}/sessions/${sessionId}`;
    const res = await axios.delete(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
      validateStatus: () => true,
    });
    if (!(res.status >= 200 && res.status < 300)) {
      this.logger.warn(
        `killSession ${res.status}: ${JSON.stringify(res.data)}`,
      );
    }
    return res.status >= 200 && res.status < 300;
  }

  async logoutUserAll(userId: string): Promise<boolean> {
    const token = await this.getAdminToken();
    const url = `${this.adminBase()}/users/${userId}/logout`;
    const res = await axios.post(url, null, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }
}
