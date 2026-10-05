import { ConfigService } from '@nestjs/config';
import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AuditService } from './audit.service.js';
import { Clock, SystemClock } from './clock.js';
import { ConsoleNotifier, Notifier } from './notifier.js';
import { WhatsAppBsp } from './provider-notifiers.js';
import { NotificationsService } from './notifications.service.js';
import { REDIS, redisProvider } from './redis.js';
import { FileStorage, LocalFileStorage } from './storage.js';

@Global()
@Module({
  providers: [
    redisProvider,
    AuditService,
    NotificationsService,
    { provide: Clock, useClass: SystemClock },
    ConsoleNotifier,
    WhatsAppBsp,
    {
      provide: Notifier,
      inject: [ConfigService, ConsoleNotifier, WhatsAppBsp],
      useFactory: (c: ConfigService, dev: ConsoleNotifier, live: WhatsAppBsp): Notifier => {
        if (c.get('NOTIFIER') === 'live') return live;
        // OTPs would be printed to the server log: never allow that in production.
        if (c.get('NODE_ENV') === 'production') throw new Error('NOTIFIER=live (with WHATSAPP_API_KEY) is required in production');
        return dev;
      },
    },
    { provide: FileStorage, useClass: LocalFileStorage },
  ],
  exports: [REDIS, AuditService, NotificationsService, Clock, Notifier, FileStorage],
})
export class CommonModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    this.redis.disconnect();
  }
}
