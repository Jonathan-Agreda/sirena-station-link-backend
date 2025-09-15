import { Controller, Get, Req, UseGuards } from '@nestjs/common';
// --- INICIO CORRECCIÓN TS1272 ---
// Importamos 'Request' como un tipo, no como un valor.
import type { Request } from 'express';
// --- FIN CORRECCIÓN TS1272 ---
import { KeycloakGuard } from 'src/auth/keycloak.guard';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Genera un link único de un solo uso (implícito) para vincular
   * la cuenta de Telegram con la cuenta de SirenaStation del usuario logueado.
   */
  @UseGuards(KeycloakGuard) // Protegemos el endpoint
  @Get('generate-link')
  async getTelegramLink(@Req() req: Request) {
    // El KeycloakGuard añade el payload del token a req.user
    // 'sub' es el 'subject', que es el ID de usuario (UUID)
    const userId = (req as any).user.sub;

    if (!userId) {
      throw new Error('No se pudo obtener el ID de usuario desde el token.');
    }

    // Obtenemos el username del bot dinámicamente
    const { username } = await this.telegramService.bot.telegram.getMe();

    return {
      link: `https://t.me/${username}?start=${userId}`,
    };
  }
}
