import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';

@Roles(UserRole.CLINIC_OWNER, UserRole.CLINIC_STAFF)
@Controller('clinic-panel')
export class PanelHomeController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** The clinics the logged-in owner / receptionist may manage. */
  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.ds.query(
      `SELECT c.id, c.name, c.slug, c.status, cm.role FROM clinic_members cm JOIN clinics c ON c.id = cm.clinic_id WHERE cm.user_id = $1 ORDER BY c.name`,
      [u.id],
    );
  }
}
