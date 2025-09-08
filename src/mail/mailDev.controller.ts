import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Controller('dev/mail')
export class MailDevController {
  constructor(
    private cfg: ConfigService,
    private mail: MailService,
  ) {}

  private enabled() {
    return String(this.cfg.get('MAIL_DEV_ENABLED')).toLowerCase() === 'true';
  }

  @Post('test')
  async sendTest(
    @Body() body: { to: string; name?: string; username?: string },
  ) {
    if (!this.enabled()) {
      return { ok: false, error: 'Not Found' };
    }
    const to = body?.to;
    const name = body?.name || 'Usuario';
    const username = body?.username || body?.to; // 👈 fallback al email
    if (!to) return { ok: false, error: 'to required' };

    const info = await this.mail.sendWelcomeUserEmail({ to, name, username });
    return { ok: true, messageId: info.messageId };
  }
}
