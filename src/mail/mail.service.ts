import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { TemplateRenderer } from './template/renderer';

type WelcomePayload = {
  to: string;
  name: string;
  username: string; // 👈 ahora requerido
  tempPassword?: string;
  loginUrl?: string;
};
type FirstChangePayload = { to: string; name: string; changeUrl: string };
type ForgotPayload = { to: string; name: string; resetUrl: string };
type ContactPayload = {
  to: string;
  name: string;
  email: string;
  message: string;
};
type ProfilePayload = { to: string; name: string; details: string };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly config: ConfigService,
    private readonly renderer: TemplateRenderer,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: Number(this.config.get<number>('MAIL_PORT') || 465),
      secure:
        this.config.get('MAIL_SECURE') === 'true' ||
        String(this.config.get('MAIL_PORT')) === '465',
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  private from() {
    const name = this.config.get('MAIL_FROM_NAME') || 'Sirena Station Link';
    const email =
      this.config.get('MAIL_FROM_EMAIL') || this.config.get('MAIL_USER');
    return `"${name}" <${email}>`;
  }

  // === Bienvenida ===
  async sendWelcomeUserEmail(p: WelcomePayload) {
    const tempPassword =
      p.tempPassword || process.env.USER_DEFAULT_PASSWORD || 'changeme123';
    const loginUrl =
      p.loginUrl ||
      this.config.get('APP_LOGIN_URL') ||
      'https://sirenastationlink.disxor.com/login';

    const html = this.renderer.render({
      template: 'welcome-user',
      data: {
        name: p.name,
        email: p.to,
        username: p.username, // 👈 ahora sí se pasa al template
        tempPassword,
        loginUrl,
      },
    });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    const info = await this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: '¡Bienvenido a SirenaStationLink!',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
    this.logger.log(`Welcome → ${p.to} (${info.messageId})`);
    return info;
  }

  // === Primer cambio de contraseña ===
  async sendFirstChangePasswordEmail(p: FirstChangePayload) {
    const html = this.renderer.render({
      template: 'first-change-password',
      data: p,
    });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Cambiar contraseña (primer acceso) — Sirena Station Link',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }

  // === Recuperar contraseña ===
  async sendForgotPasswordEmail(p: ForgotPayload) {
    const html = this.renderer.render({ template: 'forgot-password', data: p });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Restablecer contraseña — Sirena Station Link',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }

  // === Contacto ===
  async sendContactEmail(p: ContactPayload) {
    const html = this.renderer.render({ template: 'contact', data: p });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Nuevo mensaje de contacto',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }

  // === Perfil actualizado ===
  async sendProfileUpdatedEmail(p: ProfilePayload) {
    const html = this.renderer.render({ template: 'profile-updated', data: p });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Actualización de datos — Sirena Station Link',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }
}
