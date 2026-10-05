import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Area, Clinic, ClinicImage } from '../database/entities/index.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AdminClinicsController } from './admin-clinics.controller.js';
import { ClinicsService } from './clinics.service.js';
import { ClinicImagesService } from './images.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic, ClinicImage, Area]), SettingsModule, SubscriptionsModule],
  controllers: [AdminClinicsController],
  providers: [ClinicsService, ClinicImagesService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
