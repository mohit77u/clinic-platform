import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clock } from '../common/clock.js';
import { UserRole } from '../common/enums.js';
import { User } from '../database/entities/index.js';
import type { AuthUser } from './auth.types.js';
import { OtpService } from './otp.service.js';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  /** Verifies the OTP; unknown mobiles become patients, existing users keep their role. */
  async loginWithOtp(mobile: string, code: string, purpose: string): Promise<User> {
    await this.otp.verify(mobile, purpose, code);
    let user = await this.users.findOne({ where: { mobile } });
    if (!user) {
      // Concurrent first logins: insert-or-ignore, then read back.
      await this.users.createQueryBuilder().insert().values({ mobile, role: UserRole.PATIENT }).orIgnore().execute();
      user = await this.users.findOneByOrFail({ mobile });
    }
    if (!user.isActive) throw new ForbiddenException('This account is disabled');
    await this.users.update(user.id, { lastLoginAt: this.clock.now() });
    return user;
  }

  async issueTokens(user: Pick<User, 'id' | 'role'>) {
    const payload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ACCESS_TTL_SECONDS });
    const refreshToken = await this.jwt.signAsync(payload, { secret: this.refreshSecret, expiresIn: REFRESH_TTL_SECONDS });
    return { accessToken, refreshToken };
  }

  async verifyAccess(token: string): Promise<AuthUser> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: UserRole }>(token);
      return { id: p.sub, role: p.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /** Re-reads the user so role changes / deactivation take effect at refresh time. */
  async refresh(token: string) {
    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: this.refreshSecret }));
    } catch {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    const user = await this.users.findOne({ where: { id: sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Session expired. Please log in again.');
    return { user, ...(await this.issueTokens(user)) };
  }

  me(id: string) {
    return this.users.findOneOrFail({ where: { id }, select: { id: true, role: true, name: true, mobile: true, email: true } });
  }
}
