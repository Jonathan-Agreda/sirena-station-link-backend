import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as jose from 'jose';

type OIDCConfig = {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  authorization_endpoint: string;
  end_session_endpoint?: string;
};

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discovery?: OIDCConfig;
  // jose v5/6: tipa el JWKS con ReturnType de createRemoteJWKSet
  private jwks?: ReturnType<typeof jose.createRemoteJWKSet>;

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
    const expectedAud = process.env.KEYCLOAK_EXPECTED_AUD;

    const result = await jose.jwtVerify(token, jwks, {
      issuer: discovery.issuer,
      audience: expectedAud || undefined,
      algorithms: ['RS256'],
    });

    return { payload: result.payload, protectedHeader: result.protectedHeader };
  }
}
