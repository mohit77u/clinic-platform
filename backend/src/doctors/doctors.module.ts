import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Doctor, DoctorSchedule } from '../database/entities/index.js';
import { AdminDoctorsController } from './admin-doctors.controller.js';
import { DoctorsService } from './doctors.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Doctor, DoctorSchedule])],
  controllers: [AdminDoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
