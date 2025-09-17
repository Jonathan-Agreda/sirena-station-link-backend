import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/data/prisma.service';
import { InjectBot, Start, Ctx, Update, Command } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { SirensService, SirenState } from '../sirens/sirens.service';

type StartCtx = Context & { startPayload?: string };

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() public readonly bot: Telegraf<Context>,
    private readonly prisma: PrismaService,
    private readonly sirensService: SirensService, // Inyecta el servicio de sirenas
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
      return;
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

  async sendToGroup(groupId: string, message: string) {
    try {
      await this.bot.telegram.sendMessage(groupId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      this.logger.log(`Notificación enviada a grupo ${groupId}: ${message}`);
    } catch (err) {
      this.logger.error(`Error enviando a Telegram group ${groupId}:`, err);
    }
  }

  @Command('state')
  async handleState(@Ctx() ctx: Context) {
    const chatId = String(ctx.chat?.id ?? '');
    if (!chatId) return;

    // 1. Buscar usuario por telegramChatId
    const user = await this.prisma.user.findFirst({
      where: { telegramChatId: chatId },
    });

    if (!user) {
      await ctx.reply(
        'No tienes una cuenta vinculada. Usa /start para vincular.',
      );
      return;
    }

    // 2. Obtener estados de sirenas según el rol
    const sirens: SirenState[] = await this.sirensService.getSirensStateForUser(
      {
        id: user.id,
        role: user.role,
        urbanizationId: user.urbanizationId ?? null,
        userId: user.id,
        roles: [user.role],
      },
    );

    if (!sirens.length) {
      await ctx.reply('No tienes sirenas asociadas.');
      return;
    }

    // 3. Formatear respuesta con emojis y HTML
    const lines = sirens.map((s) => {
      const online = s.online ? '🟢 Online' : '🔴 Offline';
      const relay =
        s.relay === 'ON'
          ? '🚨 <b>SIRENA ACTIVADA</b>'
          : '✅ <b>SIRENA DESACTIVADA</b>';
      return `<b>${s.deviceId}</b> (${s.urbanizationName}): ${online} · ${relay}`;
    });

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  }
}
