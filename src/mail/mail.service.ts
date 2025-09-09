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
    const name = this.config.get('MAIL_FROM_NAME') || 'SirenaStationLink';
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
    const loginUrl =
      p.changeUrl ||
      this.config.get('APP_LOGIN_URL') ||
      'https://sirenastationlink.disxor.com/login';

    const html = this.renderer.render({
      template: 'first-change-password',
      data: {
        name: p.name,
        loginUrl, // 👈 ahora sí se pasa al template
      },
    });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Contraseña Actualizada (primer acceso) — SirenaStationLink',
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
      subject: 'Restablecer contraseña — SirenaStationLink',
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
  async sendProfileUpdatedEmail(p: { to: string; name: string }) {
    const loginUrl =
      this.config.get('APP_LOGIN_URL') ||
      'https://sirenastationlink.disxor.com/login';

    const html = this.renderer.render({
      template: 'profile-updated',
      data: {
        name: p.name,
        loginUrl,
      },
    });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Perfil actualizado — SirenaStationLink',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }

  // === Confirmación de cambio de contraseña ===
  async sendPasswordUpdatedEmail(p: { to: string; name: string }) {
    const loginUrl =
      this.config.get('APP_LOGIN_URL') ||
      'https://sirenastationlink.disxor.com/login';

    const html = this.renderer.render({
      template: 'password-updated',
      data: { name: p.name, loginUrl },
    });

    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Confirmación de cambio de contraseña — SirenaStationLink',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }

  // === Notificación de eliminación de cuenta ===
  async sendUserDeletedEmail(p: { to: string; name: string }) {
    const html = this.renderer.render({
      template: 'user-deleted',
      data: { name: p.name },
    });
    const attachments: NonNullable<nodemailer.SendMailOptions['attachments']> =
      [];
    const logo = this.renderer.getLogoAttachment();
    if (logo) attachments.push(logo);

    return this.transporter.sendMail({
      from: this.from(),
      to: p.to,
      subject: 'Tu cuenta en SirenaStationLink ha sido eliminada',
      html,
      text: this.renderer.toText(html),
      attachments,
    });
  }
}
