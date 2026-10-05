import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OriginGuard, RateLimitGuard } from '../common/security.guards.js';
import { ClinicMember, OtpRequest, User } from '../database/entities/index.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ClinicScopeGuard, JwtAuthGuard, RolesGuard } from './guards.js';
import { OtpService } from './otp.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpRequest, ClinicMember]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: c.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    ClinicScopeGuard,
    RateLimitGuard,
    { provide: APP_GUARD, useExisting: RateLimitGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, ClinicScopeGuard, RateLimitGuard, TypeOrmModule],
})
export class AuthModule {}
