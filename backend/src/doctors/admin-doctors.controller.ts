import {
  Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { MAX_IMAGE_BYTES } from '../clinics/images.service.js';
import { CreateDoctorDto, CreateScheduleDto, UpdateDoctorDto, UpdateScheduleDto } from './dto.js';
import { DoctorsService } from './doctors.service.js';

@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminDoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get('clinics/:clinicId/doctors')
  list(@Param('clinicId') clinicId: string) {
    return this.doctors.listForClinic(clinicId);
  }

  @Post('clinics/:clinicId/doctors')
  create(@Param('clinicId') clinicId: string, @Body() dto: CreateDoctorDto, @CurrentUser() u: AuthUser) {
    return this.doctors.create(clinicId, dto, u.id);
  }

  @Patch('doctors/:doctorId')
  update(@Param('doctorId') id: string, @Body() dto: UpdateDoctorDto, @CurrentUser() u: AuthUser) {
    return this.doctors.update(id, dto, u.id);
  }

  @Post('doctors/:doctorId/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  photo(@Param('doctorId') id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    return this.doctors.setPhoto(id, file.buffer, u.id);
  }

  @Post('doctors/:doctorId/schedules')
  addSchedule(@Param('doctorId') id: string, @Body() dto: CreateScheduleDto, @CurrentUser() u: AuthUser) {
    return this.doctors.addSchedule(id, dto, u.id);
  }

  @Patch('schedules/:scheduleId')
  updateSchedule(@Param('scheduleId') id: string, @Body() dto: UpdateScheduleDto, @CurrentUser() u: AuthUser) {
    return this.doctors.updateSchedule(id, dto, u.id);
  }

  @Delete('schedules/:scheduleId')
  removeSchedule(@Param('scheduleId') id: string, @CurrentUser() u: AuthUser) {
    return this.doctors.removeSchedule(id, u.id);
  }
}
