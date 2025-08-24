import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';

@Injectable()
export class KeycloakGuard implements CanActivate {
  private readonly logger = new Logger(KeycloakGuard.name);
  private client: JwksClient;

  constructor(private readonly config: ConfigService) {
    const baseUrl = this.config.get<string>('KEYCLOAK_BASE_URL');
    const realm = this.config.get<string>('KEYCLOAK_REALM');
    if (!baseUrl || !realm) {
      throw new Error('KEYCLOAK_BASE_URL o KEYCLOAK_REALM no configurados');
    }

    const jwksUri = `${baseUrl}/realms/${realm}/protocol/openid-connect/certs`;
    this.logger.log(`Inicializando JWKS client -> ${jwksUri}`);

    this.client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 60 * 60 * 1000, // 1h
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: Request = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('No Bearer token');
    }
    const token = auth.substring(7);

    try {
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader || typeof decodedHeader === 'string') {
        throw new UnauthorizedException('Token inválido');
      }

      const kid = decodedHeader.header.kid;
      const key = await this.client.getSigningKey(kid);
      const signingKey = key.getPublicKey();

      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        audience: this.config.get<string>('KEYCLOAK_CLIENT_ID'),
        issuer: `${this.config.get<string>(
          'KEYCLOAK_BASE_URL',
        )}/realms/${this.config.get<string>('KEYCLOAK_REALM')}`,
      });

      (req as any).user = verified;
      this.logger.debug(`Token válido para sub=${(verified as any).sub}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Error validando token: ${err.message}`);
      throw new UnauthorizedException('Token inválido');
    }
  }
}
