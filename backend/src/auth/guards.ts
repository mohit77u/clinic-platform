import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums.js';
import { ClinicMember } from '../database/entities/index.js';
import { IS_PUBLIC, ROLES_KEY } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './auth.types.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** Global: every route needs a valid session unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer;
    if (!token) throw new UnauthorizedException('Login required');
    req.user = await this.auth.verifyAccess(token);
    return true;
  }
}

/** Global: enforces @Roles(...) when present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenException('You do not have access to this');
    return true;
  }
}

/**
 * For routes with a `:clinicId` param. super_admin passes; clinic_owner/clinic_staff must be a member of THAT clinic.
 * Sets req.clinicRole so handlers can further restrict staff (e.g. no billing).
 */
@Injectable()
export class ClinicScopeGuard implements CanActivate {
  constructor(@InjectRepository(ClinicMember) private readonly members: Repository<ClinicMember>) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const clinicId = req.params.clinicId as string | undefined;
    if (!clinicId || !/^\d+$/.test(clinicId)) throw new ForbiddenException('Invalid clinic');
    if (req.user.role === UserRole.SUPER_ADMIN) {
      req.clinicRole = UserRole.CLINIC_OWNER;
      return true;
    }
    if (req.user.role !== UserRole.CLINIC_OWNER && req.user.role !== UserRole.CLINIC_STAFF) {
      throw new ForbiddenException('You do not have access to this clinic');
    }
    const m = await this.members.findOne({ where: { clinicId, userId: req.user.id } });
    if (!m) throw new ForbiddenException('You do not have access to this clinic');
    req.clinicRole = m.role;
    return true;
  }
}
