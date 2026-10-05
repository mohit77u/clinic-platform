import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Clock } from '../common/clock.js';
import { QueueService } from './queue.service.js';

@Injectable()
export class BookingJobs {
  private readonly logger = new Logger(BookingJobs.name);

  constructor(
    private readonly queue: QueueService,
    private readonly clock: Clock,
  ) {}

  @Cron('*/15 * * * *')
  async noShowCloser() {
    const n = await this.queue.closeNoShows(this.clock.now()).catch((e) => (this.logger.error(e), 0));
    if (n) this.logger.log(`no-show-closer closed ${n} appointments`);
  }

  /** Queue movement also triggers this; the cron covers time passing with no queue activity. */
  @Cron('*/5 * * * *')
  async turnReminders() {
    const n = await this.queue.sendTurnReminders(this.clock.now()).catch((e) => (this.logger.error(e), 0));
    if (n) this.logger.log(`turn reminders sent: ${n}`);
  }
}
