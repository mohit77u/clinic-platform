import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { AdminController } from './admin.controller.js';

@Module({ imports: [SettingsModule], controllers: [AdminController] })
export class AdminModule {}
