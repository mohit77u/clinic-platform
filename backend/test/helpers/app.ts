import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/clock.js';
import { Notification, Notifier } from '../../src/common/notifier.js';
import { REDIS } from '../../src/common/redis.js';
import { Redis } from 'ioredis';

export class CapturingNotifier extends Notifier {
  sent: Notification[] = [];
  /** channels that should throw, to exercise retry / fallback */
  failChannels = new Set<string>();
  attempts: string[] = [];
  async send(n: Notification) {
    this.attempts.push(n.channel);
    if (this.failChannels.has(n.channel)) throw new Error(`${n.channel} down`);
    this.sent.push(n);
  }
  lastOtp(mobile: string): string {
    const n = [...this.sent].reverse().find((x) => x.template === 'otp' && x.to === mobile);
    if (!n) throw new Error(`No OTP sent to ${mobile}`);
    return String(n.params.code);
  }
}

export class FakeClock extends Clock {
  constructor(private current = new Date()) {
    super();
  }
  now() {
    return new Date(this.current);
  }
  set(d: Date) {
    this.current = d;
  }
  advanceMs(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface TestApp {
  app: INestApplication;
  ds: DataSource;
  notifier: CapturingNotifier;
  clock: FakeClock;
  redis: Redis;
}

export async function createTestApp(): Promise<TestApp> {
  const notifier = new CapturingNotifier();
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Notifier)
    .useValue(notifier)
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  // Listening on an ephemeral port lets supertest fire many truly parallel requests.
  await app.listen(0);
  const redis = app.get<Redis>(REDIS);
  await redis.flushdb();
  return { app, ds: app.get(DataSource), notifier, clock, redis };
}

/** Notifications are fire-and-forget; poll until the condition holds (or fail after ~2s). */
export async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}
