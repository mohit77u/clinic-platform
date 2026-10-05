import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClinicScopeGuard } from '../auth/guards.js';
import { UserRole } from '../common/enums.js';
import { DoctorsService } from '../doctors/doctors.service.js';
import { CallNextDto, CancelByClinicDto, DateQuery, LeaveDto, WalkinDto } from './dto.js';
import { LeavesService } from './leaves.service.js';
import { QueueService } from './queue.service.js';

/** Reception / owner screens. `ClinicScopeGuard` ensures the caller belongs to :clinicId (super_admin may enter any clinic). */
@Roles(UserRole.CLINIC_OWNER, UserRole.CLINIC_STAFF, UserRole.SUPER_ADMIN)
@UseGuards(ClinicScopeGuard)
@Controller('clinic-panel/:clinicId')
export class ClinicPanelController {
  constructor(
    private readonly queue: QueueService,
    private readonly leaves: LeavesService,
    private readonly doctors: DoctorsService,
  ) {}

  @Get('queue')
  day(@Param('clinicId') clinicId: string, @Query() q: DateQuery) {
    return this.queue.day(clinicId, q.date ?? this.queue.today());
  }

  @Get('doctors')
  async doctorList(@Param('clinicId') clinicId: string) {
    return this.doctors.listForClinic(clinicId);
  }

  @Post('appointments/:id/check-in') @HttpCode(200) checkIn(@Param('clinicId') c: string, @Param('id') id: string) { return this.queue.checkIn(c, id); }
  @Post('appointments/:id/call') @HttpCode(200) call(@Param('clinicId') c: string, @Param('id') id: string) { return this.queue.call(c, id); }
  @Post('appointments/:id/skip') @HttpCode(200) skip(@Param('clinicId') c: string, @Param('id') id: string) { return this.queue.skip(c, id); }
  @Post('appointments/:id/complete') @HttpCode(200) complete(@Param('clinicId') c: string, @Param('id') id: string) { return this.queue.complete(c, id); }
  @Post('appointments/:id/no-show') @HttpCode(200) noShow(@Param('clinicId') c: string, @Param('id') id: string) { return this.queue.noShow(c, id); }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(@Param('clinicId') c: string, @Param('id') id: string, @Body() dto: CancelByClinicDto, @CurrentUser() u: AuthUser) {
    return this.queue.cancelByClinic(c, id, dto.reason, u.id);
  }

  @Post('sessions/call-next')
  @HttpCode(200)
  callNext(@Param('clinicId') c: string, @Body() dto: CallNextDto) {
    return this.queue.callNext(c, dto.scheduleId, dto.date);
  }

  @Post('walkins')
  walkin(@Param('clinicId') c: string, @Body() dto: WalkinDto, @CurrentUser() u: AuthUser) {
    return this.queue.walkin(c, dto, u.id);
  }

  @Get('doctors/:doctorId/leaves') listLeaves(@Param('doctorId') d: string) { return this.leaves.list(d); }

  @Post('doctors/:doctorId/leaves')
  addLeave(@Param('clinicId') c: string, @Param('doctorId') d: string, @Body() dto: LeaveDto, @CurrentUser() u: AuthUser) {
    return this.leaves.create(d, dto, u.id, c);
  }

  @Delete('doctors/:doctorId/leaves/:leaveId')
  removeLeave(@Param('clinicId') c: string, @Param('doctorId') d: string, @Param('leaveId') l: string, @CurrentUser() u: AuthUser) {
    return this.leaves.remove(d, l, u.id, c);
  }
}
