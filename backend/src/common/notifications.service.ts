import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationLog } from '../database/entities/index.js';
import { Lang, render, SENSITIVE_PARAMS, TemplateKey } from './notification-templates.js';
import { Notifier, NotifyChannel } from './notifier.js';

export interface SendOptions {
  to: string;
  template: TemplateKey;
  params: Record<string, string | number>;
  lang?: Lang;
  relatedAppointmentId?: string;
  relatedClinicId?: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 500, 2000];

/**
 * Single entry point for every outgoing message (WhatsApp only): renders the template, retries with backoff,
 * and records each attempt outcome in notification_logs (never the OTP itself).
 * It never throws: a failed notification must not fail a booking.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** overridable in tests to avoid real sleeping */
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  constructor(
    private readonly notifier: Notifier,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async send(o: SendOptions): Promise<boolean> {
    const lang = o.lang ?? 'hi';
    const text = render(o.template, lang, o.params);
    const channel: NotifyChannel = 'whatsapp';
    const loggable = Object.fromEntries(Object.entries(o.params).filter(([k]) => !SENSITIVE_PARAMS.has(k)));

    let lastError = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (BACKOFF_MS[attempt]) await this.sleep(BACKOFF_MS[attempt]);
      try {
        await this.notifier.send({
          channel,
          to: o.to,
          template: o.template,
          params: { ...o.params, text },
          relatedAppointmentId: o.relatedAppointmentId,
          relatedClinicId: o.relatedClinicId,
        });
        await this.log(o, channel, loggable, 'sent', null);
        return true;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        this.logger.warn(`${channel} to ${o.to} failed (attempt ${attempt + 1}): ${lastError}`);
      }
    }
    await this.log(o, channel, loggable, 'failed', lastError);
    return false;
  }

  private async log(o: SendOptions, channel: NotifyChannel, payload: Record<string, unknown>, status: string, error: string | null) {
    try {
      await this.ds.getRepository(NotificationLog).insert({
        channel,
        toAddress: o.to,
        template: o.template,
        payload: payload as never,
        status,
        error,
        relatedAppointmentId: o.relatedAppointmentId ?? null,
        relatedClinicId: o.relatedClinicId ?? null,
      });
    } catch (e) {
      this.logger.error(`Could not write notification log: ${e instanceof Error ? e.message : e}`);
    }
  }
}
