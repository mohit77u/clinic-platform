import type { Request } from 'express';
import { UserRole } from '../common/enums.js';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
  /** set by ClinicScopeGuard: the caller's role inside the requested clinic (super_admin => clinic_owner-equivalent) */
  clinicRole?: UserRole;
}
