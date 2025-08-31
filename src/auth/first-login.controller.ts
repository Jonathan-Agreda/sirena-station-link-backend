// src/auth/first-login.controller.ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FirstLoginService } from './first-login.service';
import { FirstLoginPasswordDto, PreloginDto } from './dto/first-login.dto';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class FirstLoginController {
  constructor(
    private readonly svc: FirstLoginService,
    private readonly cfg: ConfigService,
  ) {}

  @Post('prelogin')
  async prelogin(@Body() dto: PreloginDto) {
    const r = await this.svc.prelogin(dto.usernameOrEmail, dto.password);
    // Si Keycloak exige cambio de clave devolvemos un código controlado
    if (!r.ok) {
      return { ok: false, code: r.code }; // 'PASSWORD_CHANGE_REQUIRED'
    }
    return { ok: true };
  }

  @Post('first-login/password')
  async completeFirstLogin(
    @Body() dto: FirstLoginPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.svc.completeFirstLogin(
      dto.usernameOrEmail,
      dto.currentPassword,
      dto.newPassword,
    );

    // ===== Cookies según tu .env =====
    const cookieName =
      this.cfg.get<string>('REFRESH_COOKIE_NAME') ?? 'ssr_refresh';

    // booleans pueden venir como string en .env -> normalizamos
    const parseBool = (v: any, d = false) =>
      typeof v === 'string' ? v.toLowerCase() === 'true' : (v ?? d);

    const secure = parseBool(this.cfg.get('REFRESH_COOKIE_SECURE'), false);
    const httpOnly = parseBool(this.cfg.get('REFRESH_COOKIE_HTTPONLY'), true);

    const sameSiteRaw = (
      this.cfg.get<string>('REFRESH_COOKIE_SAMESITE') ?? 'Lax'
    ).toLowerCase();
    const sameSite = (
      ['lax', 'strict', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax'
    ) as 'lax' | 'strict' | 'none';

    const path = this.cfg.get<string>('REFRESH_COOKIE_PATH') || '/';
    const domain = this.cfg.get<string>('REFRESH_COOKIE_DOMAIN') || undefined;

    // maxAge: si no hay REFRESH_COOKIE_MAX_AGE_MS, usa REFRESH_TOKEN_TTL_SEC
    const maxAgeEnv = this.cfg.get<number>('REFRESH_COOKIE_MAX_AGE_MS');
    const ttlSec = this.cfg.get<number>('REFRESH_TOKEN_TTL_SEC') ?? 3600;
    const maxAge =
      typeof maxAgeEnv === 'number' && !Number.isNaN(maxAgeEnv)
        ? maxAgeEnv
        : ttlSec * 1000;

    res.cookie(cookieName, tokens.refresh_token, {
      httpOnly,
      secure,
      sameSite,
      path,
      domain,
      maxAge,
    });

    // Igual que tu /auth/login/web: devolvemos el accessToken en JSON
    return { accessToken: tokens.access_token };
  }
}
