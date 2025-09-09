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
    @Body()
    body: {
      to: string;
      name?: string;
      username?: string;
      type:
        | 'welcome'
        | 'first-change'
        | 'forgot'
        | 'contact'
        | 'profile'
        | 'password-updated';
    },
  ) {
    if (!this.enabled()) {
      return { ok: false, error: 'Not Found' };
    }

    const to = body?.to;
    const name = body?.name || 'Usuario';
    const username = body?.username || body?.to;
    const type = body?.type || 'welcome';

    if (!to) return { ok: false, error: 'to required' };

    let info;
    switch (type) {
      case 'welcome':
        info = await this.mail.sendWelcomeUserEmail({
          to,
          name,
          username,
        });
        break;

      case 'first-change':
        info = await this.mail.sendFirstChangePasswordEmail({
          to,
          name,
          changeUrl:
            this.cfg.get('APP_LOGIN_URL') ||
            'https://sirenastationlink.disxor.com/login',
        });
        break;

      case 'forgot':
        info = await this.mail.sendForgotPasswordEmail({
          to,
          name,
          resetUrl:
            this.cfg.get('APP_LOGIN_URL') + '/reset' ||
            'https://sirenastationlink.disxor.com/reset',
        });
        break;

      case 'contact':
        info = await this.mail.sendContactEmail({
          to,
          name,
          email: 'soporte@sirenastationlink.com',
          message: 'Mensaje de prueba del template Contacto',
        });
        break;

      case 'profile':
        info = await this.mail.sendProfileUpdatedEmail({
          to,
          name,
        });
        break;

      case 'password-updated':
        info = await this.mail.sendPasswordUpdatedEmail({
          to,
          name,
        });
        break;

      default:
        return { ok: false, error: 'Invalid type' };
    }

    return { ok: true, type, messageId: info.messageId };
  }
}
