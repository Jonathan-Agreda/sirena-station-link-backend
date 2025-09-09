import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import juice from 'juice';
import { minify } from 'html-minifier';

type TemplateName =
  | 'welcome-user'
  | 'first-change-password'
  | 'forgot-password'
  | 'contact'
  | 'profile-updated'
  | 'password-updated'
  | 'user-deleted'; // 👈 nuevo agregado

type RenderOptions = {
  template: TemplateName;
  data: Record<string, any>;
};

@Injectable()
export class TemplateRenderer {
  private readonly root = join(process.cwd(), 'src', 'mail', 'templates');

  constructor(private readonly config: ConfigService) {
    // Partials
    const partialsDir = join(this.root, 'partials');
    Handlebars.registerPartial(
      'button',
      readFileSync(join(partialsDir, 'button.hbs'), 'utf8'),
    );
    Handlebars.registerPartial(
      'footer',
      readFileSync(join(partialsDir, 'footer.hbs'), 'utf8'),
    );

    // Helpers
    Handlebars.registerHelper('year', () => new Date().getFullYear());
  }

  render({ template, data }: RenderOptions) {
    const layout = Handlebars.compile(
      readFileSync(join(this.root, 'layout.hbs'), 'utf8'),
    );
    const view = Handlebars.compile(
      readFileSync(join(this.root, `${template}.hbs`), 'utf8'),
    );

    const html = layout({
      brand: {
        primary: this.config.get('MAIL_BRAND_PRIMARY') || '#0ea5e9',
        dark: this.config.get('MAIL_BRAND_DARK') || '#0b1220',
        accent: this.config.get('MAIL_BRAND_ACCENT') || '#22d3ee',
      },
      logoUrl: this.config.get('MAIL_LOGO_URL') || null,
      logoCid: 'logo_cid',
      content: view(data),
    });

    const inlined = juice(html);
    const minified = minify(inlined, {
      collapseWhitespace: true,
      minifyCSS: true,
      removeComments: true,
    });

    return minified;
  }

  getLogoAttachment() {
    const path = this.config.get('MAIL_LOGO_PATH');
    if (path && existsSync(path)) {
      return { filename: 'logo.png', path, cid: 'logo_cid' };
    }
    return undefined;
  }

  toText(html: string) {
    return html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
