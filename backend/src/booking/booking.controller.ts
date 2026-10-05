import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { AvailabilityService } from './availability.service.js';
import { BookingService } from './booking.service.js';
import { CreateBookingDto, MyBookingsQuery, PatientInputDto } from './dto.js';

@Controller()
export class BookingController {
  constructor(
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
  ) {}

  @Public()
  @Get('doctors/:slug/availability')
  availabilityFor(@Param('slug') slug: string) {
    return this.availability.forDoctorSlug(slug);
  }

  @Public()
  @Get('queue/:publicId')
  queue(@Param('publicId', new ParseUUIDPipe()) publicId: string) {
    return this.booking.queueView(publicId);
  }

  @Roles(UserRole.PATIENT)
  @Get('patients')
  patients(@CurrentUser() u: AuthUser) {
    return this.booking.listPatients(u.id);
  }

  @Roles(UserRole.PATIENT)
  @Post('patients')
  createPatient(@CurrentUser() u: AuthUser, @Body() dto: PatientInputDto) {
    return this.booking.createPatient(u.id, dto);
  }

  @Roles(UserRole.PATIENT)
  @Post('bookings')
  book(@CurrentUser() u: AuthUser, @Body() dto: CreateBookingDto) {
    return this.booking.book(u, dto);
  }

  @Roles(UserRole.PATIENT)
  @Get('bookings/mine')
  mine(@CurrentUser() u: AuthUser, @Query() q: MyBookingsQuery) {
    return this.booking.mine(u.id, q.scope);
  }

  @Roles(UserRole.PATIENT)
  @Post('bookings/:publicId/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('publicId', new ParseUUIDPipe()) publicId: string) {
    return this.booking.cancel(u.id, publicId);
  }
}
