import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as jose from 'jose';
import { URLSearchParams } from 'url';

type OIDCConfig = {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  authorization_endpoint: string;
  end_session_endpoint?: string;
};

export type KeycloakTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
  session_state?: string;
  scope?: string;
};

export type UserFromToken = {
  /** sub (UUID) — puede venir undefined si el token no lo trae o hubo error de decode */
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  roles?: string[];
};

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discovery?: OIDCConfig;
  private jwks?: ReturnType<typeof jose.createRemoteJWKSet>;

  // ---------- Discovery / JWKS ----------
  private issuerUrl() {
    const base = process.env.KEYCLOAK_BASE_URL!;
    const realm = process.env.KEYCLOAK_REALM || 'alarma';
    return `${base}/realms/${realm}`;
  }

  async getDiscovery(): Promise<OIDCConfig> {
    if (this.discovery) return this.discovery;
    const issuer = this.issuerUrl();
    const url = `${issuer}/.well-known/openid-configuration`;
    const { data } = await axios.get(url, { timeout: 8000 });
    this.discovery = {
      issuer: data.issuer,
      jwks_uri: data.jwks_uri,
      token_endpoint: data.token_endpoint,
      authorization_endpoint: data.authorization_endpoint,
      end_session_endpoint: data.end_session_endpoint,
    };
    return this.discovery;
  }

  async getJWKS() {
    if (this.jwks) return this.jwks;
    const { jwks_uri } = await this.getDiscovery();
    this.jwks = jose.createRemoteJWKSet(new URL(jwks_uri), {
      timeoutDuration: 8000,
    });
    return this.jwks;
  }

  /**
   * Verifica un Access Token (Bearer) emitido por Keycloak.
   */
  async verifyAccessToken(token: string) {
    const discovery = await this.getDiscovery();
    const jwks = await this.getJWKS();
    const expectedAud = process.env.KEYCLOAK_EXPECTED_ID;

    const result = await jose.jwtVerify(token, jwks, {
      issuer: discovery.issuer,
      audience: expectedAud || undefined,
      algorithms: ['RS256'],
    });

    return { payload: result.payload, protectedHeader: result.protectedHeader };
  }

  // ---------- Token endpoints ----------
  private tokenEndpoint() {
    return `${this.issuerUrl()}/protocol/openid-connect/token`;
  }
  private logoutEndpoint() {
    return `${this.issuerUrl()}/protocol/openid-connect/logout`;
  }

  private async kcToken(
    body: Record<string, string>,
  ): Promise<KeycloakTokenResponse> {
    const form = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID || 'backend-api',
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      ...body,
    });
    const res = await axios.post(this.tokenEndpoint(), form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      this.logger.warn(
        `Keycloak token error ${res.status}: ${JSON.stringify(res.data)}`,
      );
      throw new UnauthorizedException('Keycloak token error');
    }
    return res.data as KeycloakTokenResponse;
  }

  async loginWithPassword(usernameOrEmail: string, password: string) {
    const tok = await this.kcToken({
      grant_type: 'password',
      username: usernameOrEmail,
      password,
      scope: 'openid',
    });
    const user = this.decodeUser(tok.access_token);
    return { tok, user };
  }

  async refreshWithToken(refreshToken: string) {
    const tok = await this.kcToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const user = this.decodeUser(tok.access_token);
    return { tok, user };
  }

  async logoutWithRefresh(refreshToken: string) {
    const form = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID || 'backend-api',
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      refresh_token: refreshToken,
    });
    const res = await axios.post(this.logoutEndpoint(), form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
      validateStatus: () => true,
    });
    // idempotente
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  }

  // ---------- Helpers de claims / usuario ----------
  /**
   * Extrae claims sin verificar (útil para logging o derivar username rápidamente).
   * Para seguridad usa siempre verifyAccessToken en los guards.
   */
  extractClaims<T = any>(accessToken: string): T {
    return jose.decodeJwt(accessToken) as T;
  }

  decodeUser(accessToken: string): UserFromToken {
    const p: any = this.extractClaims(accessToken);

    const roles: string[] = Array.isArray(p?.realm_access?.roles)
      ? p.realm_access.roles
      : [];

    // IMPORTANTE: id solo si sub es string. Nada de "String(p.sub)".
    const id =
      typeof p?.sub === 'string' && p.sub.length > 0 ? p.sub : undefined;

    const username =
      (typeof p?.preferred_username === 'string' && p.preferred_username) ||
      (typeof p?.username === 'string' && p.username) ||
      undefined;

    const email = typeof p?.email === 'string' ? p.email : undefined;

    const name =
      (typeof p?.name === 'string' && p.name) ||
      [p?.given_name, p?.family_name].filter(Boolean).join(' ') ||
      undefined;

    return { id, username, email, name, roles };
  }
}
