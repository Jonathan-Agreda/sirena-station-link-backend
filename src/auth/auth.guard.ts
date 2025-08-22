import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { OidcService } from './oidc.service';

export type AuthUser = {
  sub: string;
  email?: string;
  username?: string;
  roles: string[];
  raw: any;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly oidc: OidcService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = (req.headers['authorization'] || '') as string;
    if (!auth.startsWith('Bearer '))
      throw new UnauthorizedException('Missing Bearer token');

    const token = auth.substring('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Empty token');

    try {
      const { payload } = await this.oidc.verifyAccessToken(token);
      const p = payload as Record<string, any>;

      // roles seguros (realm_access puede no existir o no tener roles)
      const roles: string[] = Array.isArray(p?.realm_access?.roles)
        ? p.realm_access.roles
        : [];

      // username seguro (puede venir en preferred_username o username)
      const username: string | undefined =
        (typeof p?.preferred_username === 'string' && p.preferred_username) ||
        (typeof p?.username === 'string' && p.username) ||
        undefined;

      const user: AuthUser = {
        sub: String(p.sub),
        email: typeof p?.email === 'string' ? p.email : undefined,
        username,
        roles,
        raw: p,
      };

      (req as any).user = user;
      return true;
    } catch (e: any) {
      if (e?.code === 'ERR_JWT_EXPIRED')
        throw new UnauthorizedException('Token expired');
      if (e?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED')
        throw new UnauthorizedException('Invalid token signature');
      throw new ForbiddenException(e?.message || 'Invalid token');
    }
  }
}
