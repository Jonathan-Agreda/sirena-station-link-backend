import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  Req,
  Logger, // 👈 Asegúrate de que este import esté
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { FirstLoginService } from './first-login.service';
import { FirstLoginPasswordDto, PreloginDto } from './dto/first-login.dto';
import { ConfigService } from '@nestjs/config';
import { ChangePasswordWebDto } from './dto/change-password.dto';
import { AuthGuard } from './auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

@Controller('auth')
export class FirstLoginController {
  private readonly logger = new Logger(FirstLoginController.name); // 👈 Añadido para logs

  constructor(
    private readonly svc: FirstLoginService,
    private readonly cfg: ConfigService,
  ) {}

  @Post('prelogin')
  async prelogin(@Body() dto: PreloginDto) {
    const r = await this.svc.prelogin(dto.usernameOrEmail, dto.password);
    if (!r.ok) {
      return { ok: false, code: r.code };
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

    const cookieName =
      this.cfg.get<string>('REFRESH_COOKIE_NAME') ?? 'ssr_refresh';
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

    return { accessToken: tokens.access_token };
  }

  @UseGuards(AuthGuard)
  @Post('change-password/web')
  async changePasswordWeb(
    @Req() req: Request & { user?: any },
    @Body() dto: ChangePasswordWebDto,
  ) {
    await this.svc.changePasswordForAuthenticatedUser(
      (req as any).user,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: 'Contraseña actualizada correctamente' };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.logger.log(
      `[Forgot Password] Endpoint recibido con email: ${dto.email}`,
    );
    await this.svc.sendForgotPasswordLink(dto.email);
    return {
      message:
        'Si el correo electrónico está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
  }
}
