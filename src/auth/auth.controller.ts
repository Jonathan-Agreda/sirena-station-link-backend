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

@Controller('auth')
export class AuthController {
  constructor(private readonly oidc: OidcService) {}

  // ==================== Helpers cookie refresh (Web) ====================
  private get cookieName() {
    return process.env.REFRESH_COOKIE_NAME || 'ssr_refresh';
  }

  /** Normaliza SameSite a valores válidos para Express: 'lax' | 'strict' | 'none' */
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
    const SAMESITE = this.resolveSameSite(); // <-- minúsculas garantizadas
    const DOMAIN = process.env.REFRESH_COOKIE_DOMAIN || undefined;
    const PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth/refresh';

    // Nota: los navegadores requieren Secure cuando SameSite=None (solo advertimos)
    if (SAMESITE === 'none' && !SECURE) {
      // eslint-disable-next-line no-console
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
      // maxAge opcional: dejamos que Keycloak gobierne TTL del refresh
    });
  }

  private clearRtCookie(res: Response) {
    const SECURE =
      (process.env.REFRESH_COOKIE_SECURE || 'false').toLowerCase() === 'true';
    const HTTPONLY =
      (process.env.REFRESH_COOKIE_HTTPONLY || 'true').toLowerCase() === 'true';
    const SAMESITE = this.resolveSameSite(); // <-- minúsculas garantizadas
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tok, user } = await this.oidc.loginWithPassword(
      dto.usernameOrEmail,
      dto.password,
    );
    if (!tok.refresh_token)
      throw new UnauthorizedException('No refresh_token from IdP');
    this.setRtCookie(res, tok.refresh_token);
    return { accessToken: tok.access_token, user };
  }

  @Post('refresh/web')
  @HttpCode(200)
  async refreshWeb(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = (req.cookies || {})[this.cookieName];
    if (!rt) throw new UnauthorizedException('Missing refresh cookie');
    const { tok } = await this.oidc.refreshWithToken(rt);
    if (tok.refresh_token) this.setRtCookie(res, tok.refresh_token); // rotación si aplica
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
    return { message: 'Sesión cerrada (web)' };
  }

  // ============================== API PROTEGIDA (tu base existente) ==============================
  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const u = req.user;
    return {
      sub: u.sub,
      email: u.email,
      username: u.username,
      roles: u.roles,
    };
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
  async loginMobile(@Body() dto: LoginDto) {
    const { tok, user } = await this.oidc.loginWithPassword(
      dto.usernameOrEmail,
      dto.password,
    );
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      user,
    };
  }

  @Post('refresh/mobile')
  @HttpCode(200)
  async refreshMobile(@Body() dto: RefreshMobileDto) {
    const { tok } = await this.oidc.refreshWithToken(dto.refreshToken);
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
    };
  }

  @Post('logout/mobile')
  @HttpCode(200)
  async logoutMobile(@Body() dto: RefreshMobileDto) {
    await this.oidc.logoutWithRefresh(dto.refreshToken);
    return { message: 'Sesión cerrada (móvil)' };
  }
}
