import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/data/prisma.service';
import { InjectBot, Start, Ctx, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

type StartCtx = Context & { startPayload?: string }; // <- tipado sin any

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() public readonly bot: Telegraf<Context>,
    private readonly prisma: PrismaService,
  ) {}

  @Start()
  async handleStart(@Ctx() ctx: StartCtx) {
    if (!ctx.chat) {
      this.logger.warn('Comando /start recibido sin contexto de chat.');
      return;
    }
    const chatId = String(ctx.chat.id);

    const payload = ctx.startPayload;

    if (!payload) {
      this.logger.warn(
        `Comando /start recibido sin payload. ChatID: ${chatId}`,
      );

      // Obtenemos nombre desde el remitente (User)
      const tgName =
        [ctx.from?.first_name, ctx.from?.last_name]
          .filter((v): v is string => Boolean(v))
          .join(' ') ||
        ctx.from?.username ||
        ('title' in ctx.chat ? ctx.chat.title : 'usuario');

      const text =
        `¡Bienvenido ${tgName}!!! Para vincular tu cuenta, por favor genera el link desde la aplicación web de SirenaStationLink.\n\n` +
        'Puedes iniciar sesión aquí: <a href="https://sirenastationlink.disxor.com/login">sirenastationlink.disxor.com/login</a>';

      await ctx.reply(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return; // evita el [object Object]
    }

    this.logger.log(
      `Intentando vincular ChatID ${chatId} con UsuarioID (Keycloak) ${payload}`,
    );

    try {
      const user = await this.prisma.user.update({
        where: { keycloakId: payload },
        data: { telegramChatId: chatId },
      });

      const userName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');

      this.logger.log(`¡Éxito! Usuario ${user.email} vinculado.`);
      await ctx.reply(
        `¡Hola ${userName || user.email}! Tu cuenta de SirenaStationLink ha sido vinculada correctamente. A partir de ahora recibirás notificaciones aquí.`,
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
