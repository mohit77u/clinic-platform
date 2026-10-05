import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { REDIS } from './redis.js';

/** Global per-IP limiter (fixed 1-minute window in Redis). Fails open if Redis is down so an outage never blocks patients. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  /** requests per minute per IP; public so tests (and ops tooling) can adjust it at runtime */
  limit: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.limit = Number(config.get('RATE_LIMIT_PER_MIN') ?? 300);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.path === '/health' || req.path.startsWith('/webhooks/')) return true;
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `rl:${req.ip}:${bucket}`;
    try {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, 70);
      res.setHeader('X-RateLimit-Limit', String(this.limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.limit - n)));
      if (n > this.limit) {
        res.setHeader('Retry-After', String(60 - (Math.floor(Date.now() / 1000) % 60)));
        throw new HttpException('Too many requests. Please slow down.', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`rate limiter unavailable: ${e instanceof Error ? e.message : e}`);
    }
    return true;
  }
}

/**
 * CSRF defence for cookie auth: a state-changing request that carries our session cookies and an Origin header
 * must come from one of our own origins (SameSite=Lax is the first layer, this is the second).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService) {
    this.allowed = new Set(config.getOrThrow<string>('CORS_ORIGIN').split(',').map((o) => o.trim()));
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const origin = req.headers.origin;
    const hasSession = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
    if (origin && hasSession && !this.allowed.has(origin)) throw new ForbiddenException('Cross-site request blocked');
    return true;
  }
}
