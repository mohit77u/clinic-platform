import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TEMPLATES } from './notification-templates.js';
import type { TemplateKey } from './notification-templates.js';
import { Notification, Notifier } from './notifier.js';

/** Placeholder names in template order, e.g. ["code","minutes"]; WhatsApp template variables are positional ({{1}}, {{2}}...). */
export function templateVars(template: TemplateKey, params: Record<string, string | number>): string[] {
  const names = [...TEMPLATES[template].hi.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return names.map((n) => String(params[n] ?? ''));
}

/**
 * WhatsApp through a BSP (Interakt-style template API). The template name equals our template key and must be approved
 * in WhatsApp Manager first. The OTP template must be created as an *Authentication* template (copy-code button), which
 * takes the code as the button value as well as the body value.
 * NOTE: payload shape follows the BSP's documented API but has NOT been exercised against a live account.
 */
@Injectable()
export class WhatsAppBsp extends Notifier {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(n: Notification): Promise<void> {
    const apiKey = this.config.getOrThrow<string>('WHATSAPP_API_KEY');
    const vars = templateVars(n.template as TemplateKey, n.params);
    const template: Record<string, unknown> = { name: n.template, languageCode: 'hi', bodyValues: vars };
    if (n.template === 'otp') template.buttonValues = { '0': [String(n.params.code)] };

    const res = await fetch('https://api.interakt.ai/v1/public/message/', {
      method: 'POST',
      headers: { authorization: `Basic ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ countryCode: '+91', phoneNumber: n.to.replace(/^91/, ''), type: 'Template', template }),
    });
    if (!res.ok) throw new Error(`WhatsApp BSP responded ${res.status}`);
  }
}
