import { Injectable } from '@nestjs/common';

/** Abstraction over "now" so expiry/cron logic is testable with a fake clock. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
