import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Redis } from 'ioredis';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { Clock } from '../common/clock.js';
import { NotificationsService } from '../common/notifications.service.js';
import { REDIS } from '../common/redis.js';
import { OtpRequest } from '../database/entities/index.js';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const MOBILE_LIMIT_PER_HOUR = 3;
const IP_LIMIT_PER_DAY = 10;

@Injectable()
export class OtpService {
  private readonly secret: string;

  constructor(
    @InjectRepository(OtpRequest) private readonly repo: Repository<OtpRequest>,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  private hash(mobile: string, code: string): string {
    return createHmac('sha256', this.secret).update(`${mobile}:${code}`).digest('hex');
  }

  private async hit(key: string, limit: number, ttlSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, ttlSeconds);
    if (count > limit) {
      throw new HttpException('Too many OTP requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async send(mobile: string, purpose: string, ip: string | null): Promise<void> {
    await this.hit(`otp:m:${mobile}`, MOBILE_LIMIT_PER_HOUR, 3600);
    if (ip) await this.hit(`otp:ip:${ip}`, IP_LIMIT_PER_DAY, 86400);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.insert({
      mobile,
      purpose,
      codeHash: this.hash(mobile, code),
      expiresAt: new Date(this.clock.now().getTime() + OTP_TTL_MS),
      ip,
    });
    const sent = await this.notifications.send({ to: mobile, template: 'otp', params: { code, minutes: 5 } });
    if (!sent) throw new ServiceUnavailableException('Could not send the OTP right now. Please try again.');
  }

  /** Throws unless the latest live OTP for this mobile+purpose matches. Consumes it on success. */
  async verify(mobile: string, purpose: string, code: string): Promise<void> {
    const now = this.clock.now();
    const otp = await this.repo.findOne({
      where: { mobile, purpose, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new BadRequestException('OTP expired or invalid. Request a new one.');

    // Count the attempt first so parallel guesses cannot exceed the limit.
    const res = await this.repo
      .createQueryBuilder()
      .update()
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND attempts < :max AND consumed_at IS NULL', { id: otp.id, max: OTP_MAX_ATTEMPTS })
      .execute();
    if (!res.affected) throw new BadRequestException('OTP expired or invalid. Request a new one.');

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.hash(mobile, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException('Incorrect OTP');
    }

    const consumed = await this.repo.update({ id: otp.id, consumedAt: IsNull() }, { consumedAt: now });
    if (!consumed.affected) throw new BadRequestException('OTP already used');
  }
}
