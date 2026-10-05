import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BookingModule } from './booking/booking.module.js';
import { ClinicsModule } from './clinics/clinics.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { PrivacyModule } from './privacy/privacy.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PublicModule } from './public/public.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { CommonModule } from './common/common.module.js';
import { buildDataSourceOptions } from './database/data-source.js';

@Module({
  imports: [
    CommonModule,
    AuthModule,
    SettingsModule,
    SubscriptionsModule,
    ClinicsModule,
    DoctorsModule,
    AdminModule,
    PublicModule,
    BookingModule,
    PaymentsModule,
    PrivacyModule,
    DocumentsModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST'),
          DB_PORT: config.get('DB_PORT'),
          DB_USERNAME: config.get('DB_USERNAME'),
          DB_PASSWORD: config.get('DB_PASSWORD'),
          DB_NAME: config.get('DB_NAME'),
        }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
