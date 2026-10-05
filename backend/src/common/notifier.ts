import { Injectable, Logger } from '@nestjs/common';

export type NotifyChannel = 'whatsapp';

export interface Notification {
  channel: NotifyChannel;
  /** mobile, E.164 without '+' */
  to: string;
  /** template key, e.g. otp, booking_confirmed */
  template: string;
  params: Record<string, string | number>;
  relatedAppointmentId?: string;
  relatedClinicId?: string;
}

/** Providers (MSG91, WhatsApp BSP, ...) implement this; business code never talks to them directly. */
export abstract class Notifier {
  abstract send(n: Notification): Promise<void>;
}

/** Dev provider: prints to the terminal. DB logging is done by NotificationsService. */
@Injectable()
export class ConsoleNotifier extends Notifier {
  private readonly logger = new Logger('Notifier');

  async send(n: Notification): Promise<void> {
    this.logger.log(`[${n.channel}] -> ${n.to} : ${String(n.params.text ?? n.template)}`);
  }
}
