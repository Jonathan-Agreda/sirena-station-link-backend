import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/data/prisma.service';
import { InjectBot, Start, Ctx, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  // Hacemos 'bot' público y 'readonly' para que el controller pueda usarlo
  constructor(
    @InjectBot() public readonly bot: Telegraf<Context>,
    private readonly prisma: PrismaService,
  ) {}

  @Start()
  async handleStart(@Ctx() ctx: Context) {
    // Validar ctx.chat
    if (!ctx.chat) {
      this.logger.warn('Comando /start recibido sin contexto de chat.');
      return; // Salir si no hay chat
    }
    const chatId = String(ctx.chat.id);

    const payload = (ctx as any).startPayload;

    if (!payload) {
      this.logger.warn(
        `Comando /start recibido sin payload. ChatID: ${chatId}`,
      );
      return ctx.reply(
        'Bienvenido. Para vincular tu cuenta, por favor usa el link que se genera en la aplicación web de SirenaStation.',
      );
    }

    this.logger.log(
      `Intentando vincular ChatID ${chatId} con UsuarioID ${payload}`,
    );

    try {
      const user = await this.prisma.user.update({
        where: { id: payload },
        data: { telegramChatId: chatId },
      });

      // Formamos el nombre como indicaste
      const userName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');

      this.logger.log(`¡Éxito! Usuario ${user.email} vinculado.`);
      await ctx.reply(
        // Usamos userName, con un fallback al email si no tuviera nombres
        `¡Hola ${userName || user.email}! Tu cuenta de SirenaStation ha sido vinculada correctamente. A partir de ahora recibirás notificaciones aquí.`,
      );
    } catch (error) {
      this.logger.error(
        `Error al vincular cuenta (Payload: ${payload}):`,
        error,
      );
      await ctx.reply(
        'Hubo un error al intentar vincular tu cuenta. Asegúrate de que estás usando el link más reciente y que tu usuario es válido.',
      );
    }
  }
}
