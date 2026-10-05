import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module.js';
import { DoctorsModule } from '../doctors/doctors.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AppointmentNotifier } from './appointment-notifier.service.js';
import { AvailabilityService } from './availability.service.js';
import { BookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';
import { ClinicPanelController } from './clinic-panel.controller.js';
import { BookingJobs } from './jobs.js';
import { PanelHomeController } from './panel-home.controller.js';
import { LeavesService } from './leaves.service.js';
import { QueueService } from './queue.service.js';
import { TokenAllocator } from './token-allocator.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, SettingsModule, DoctorsModule],
  controllers: [BookingController, PanelHomeController, ClinicPanelController],
  providers: [TokenAllocator, AvailabilityService, BookingService, QueueService, LeavesService, AppointmentNotifier, BookingJobs],
  exports: [QueueService, LeavesService, AppointmentNotifier],
})
export class BookingModule {}
