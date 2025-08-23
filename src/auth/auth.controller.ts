import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { OidcService } from './oidc.service';
import { LoginDto } from './dto/login.dto';
import { RefreshMobileDto } from './dto/refresh-mobile.dto';
import { SessionLimitService } from './session-limit.service';
import { AuditService } from './audit.service';

type JwtPayload = {
  sub?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
  sid?: string;
  session_state?: string;
};

// ---- base64url-safe ----
function base64UrlDecode(b64url: string): string {
  const b64 =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((b64url.length + 3) % 4);
  return Buffer.from(b64, 'base64').toString('utf8');
}
function safeDecodeJwt<T = any>(jwt?: string): T {
  try {
    if (!jwt) return {} as T;
    const parts = jwt.split('.');
    if (parts.length < 2) return {} as T;
    return JSON.parse(base64UrlDecode(parts[1])) as T;
  } catch {
    return {} as T;
  }
}

function isValidUUID(v?: string | null) {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  if (s === '-' || s === 'undefined' || s === 'null') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    s,
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly oidc: OidcService,
    private readonly sessionLimit: SessionLimitService,
    private readonly audit: AuditService,
  ) {}

  // ==================== Helpers cookie refresh (Web) ====================
  private get cookieName() {
    return process.env.REFRESH_COOKIE_NAME || 'ssr_refresh';
  }

  private resolveSameSite(): 'lax' | 'strict' | 'none' {
    const raw = String(
      process.env.REFRESH_COOKIE_SAMESITE ?? 'Lax',
    ).toLowerCase();
    if (raw === 'lax' || raw === 'strict' || raw === 'none') return raw;
    return 'lax';
  }

  private setRtCookie(res: Response, refreshToken: string) {
    const SECURE =
      (process.env.REFRESH_COOKIE_SECURE || 'false').toLowerCase() === 'true';
    const HTTPONLY =
      (process.env.REFRESH_COOKIE_HTTPONLY || 'true').toLowerCase() === 'true';
    const SAMESITE = this.resolveSameSite();
    const DOMAIN = process.env.REFRESH_COOKIE_DOMAIN || undefined;
    const PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth/refresh';

    if (SAMESITE === 'none' && !SECURE) {
      console.warn(
        '[auth] SameSite=None requiere Secure=true en producción (HTTPS).',
      );
    }

    res.cookie(this.cookieName, refreshToken, {
      httpOnly: HTTPONLY,
      secure: SECURE,
      sameSite: SAMESITE,
      domain: DOMAIN,
      path: PATH,
    });
  }

  private clearRtCookie(res: Response) {
    const SECURE =
      (process.env.REFRESH_COOKIE_SECURE || 'false').toLowerCase() === 'true';
    const HTTPONLY =
      (process.env.REFRESH_COOKIE_HTTPONLY || 'true').toLowerCase() === 'true';
    const SAMESITE = this.resolveSameSite();
    const DOMAIN = process.env.REFRESH_COOKIE_DOMAIN || undefined;
    const PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth/refresh';

    res.clearCookie(this.cookieName, {
      httpOnly: HTTPONLY,
      secure: SECURE,
      sameSite: SAMESITE,
      domain: DOMAIN,
      path: PATH,
    });
  }

  // ============================== WEB ==============================
  @Post('login/web')
  @HttpCode(200)
  async loginWeb(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tok, user } = await this.oidc.loginWithPassword(
      dto.usernameOrEmail,
      dto.password,
    );
    if (!tok.refresh_token)
      throw new UnauthorizedException('No refresh_token from IdP');

    const claims = safeDecodeJwt<JwtPayload>(tok.access_token);

    const username =
      claims.preferred_username || user.username || dto.usernameOrEmail;
    const roles = claims.realm_access?.roles || user.roles || [];
    const sid = tok.session_state || claims.sid || '-';

    // ⚠️ Normalizamos el sub: solo lo usamos si es UUID real
    const uidCandidate = (claims.sub || user.id || '').toString();
    const uid = isValidUUID(uidCandidate) ? uidCandidate : undefined;

    // Cookie con refresh
    this.setRtCookie(res, tok.refresh_token);

    // Auditoría
    await this.audit.record({
      action: 'login',
      userId: uid ?? '-', // evita "undefined"
      username,
      sessionId: sid,
      by: 'user',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Límite de sesiones
    try {
      await this.sessionLimit.enforce({ id: uid, username, roles }, sid);
    } catch {
      /* no romper el login si la Admin API falla */
    }

    return {
      accessToken: tok.access_token,
      user: { id: uid ?? '-', username, roles },
    };
  }

  @Post('refresh/web')
  @HttpCode(200)
  async refreshWeb(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = (req.cookies || {})[this.cookieName];
    if (!rt) throw new UnauthorizedException('Missing refresh cookie');

    const { tok, user } = await this.oidc.refreshWithToken(rt);
    if (tok.refresh_token) this.setRtCookie(res, tok.refresh_token);

    const claims = safeDecodeJwt<JwtPayload>(tok.access_token);
    const username = claims.preferred_username || user.username;
    const uidCandidate = (claims.sub || user.id || '').toString();
    const uid = isValidUUID(uidCandidate) ? uidCandidate : undefined;

    await this.audit.record({
      action: 'login',
      userId: uid ?? '-',
      username,
      sessionId: tok.session_state || claims.sid || '-',
      by: 'system',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { accessToken: tok.access_token };
  }

  @Post('logout/web')
  @HttpCode(200)
  async logoutWeb(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = (req.cookies || {})[this.cookieName];
    if (rt) await this.oidc.logoutWithRefresh(rt);
    this.clearRtCookie(res);

    await this.audit.record({
      action: 'logout',
      userId: '-',
      sessionId: '-',
      by: 'user',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { message: 'Sesión cerrada (web)' };
  }

  // ============================== PROTEGIDA ==============================
  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const u = req.user;
    return { sub: u.sub, email: u.email, username: u.username, roles: u.roles };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @Get('admin-ping')
  adminPing() {
    return { ok: true };
  }

  // ============================== MÓVIL ==============================
  @Post('login/mobile')
  @HttpCode(200)
  async loginMobile(@Body() dto: LoginDto, @Req() req: Request) {
    const { tok, user } = await this.oidc.loginWithPassword(
      dto.usernameOrEmail,
      dto.password,
    );

    const claims = safeDecodeJwt<JwtPayload>(tok.access_token);
    const username =
      claims.preferred_username || user.username || dto.usernameOrEmail;
    const roles = claims.realm_access?.roles || user.roles || [];
    const sid = tok.session_state || claims.sid || '-';
    const uidCandidate = (claims.sub || user.id || '').toString();
    const uid = isValidUUID(uidCandidate) ? uidCandidate : undefined;

    await this.audit.record({
      action: 'login',
      userId: uid ?? '-',
      username,
      sessionId: sid,
      by: 'user',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    try {
      await this.sessionLimit.enforce({ id: uid, username, roles }, sid);
    } catch {}

    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      user: { id: uid ?? '-', username, roles },
    };
  }

  @Post('refresh/mobile')
  @HttpCode(200)
  async refreshMobile(@Body() dto: RefreshMobileDto, @Req() req: Request) {
    const { tok, user } = await this.oidc.refreshWithToken(dto.refreshToken);

    const claims = safeDecodeJwt<JwtPayload>(tok.access_token);
    const username = claims.preferred_username || user.username;
    const uidCandidate = (claims.sub || user.id || '').toString();
    const uid = isValidUUID(uidCandidate) ? uidCandidate : undefined;

    await this.audit.record({
      action: 'login',
      userId: uid ?? '-',
      username,
      sessionId: tok.session_state || claims.sid || '-',
      by: 'system',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { accessToken: tok.access_token, refreshToken: tok.refresh_token };
  }

  @Post('logout/mobile')
  @HttpCode(200)
  async logoutMobile(@Body() dto: RefreshMobileDto, @Req() req: Request) {
    await this.oidc.logoutWithRefresh(dto.refreshToken);

    await this.audit.record({
      action: 'logout',
      userId: '-',
      sessionId: '-',
      by: 'user',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { message: 'Sesión cerrada (móvil)' };
  }
}
