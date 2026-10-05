import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { paymentGatewayProvider } from './gateway.js';
import { InvoiceService } from './invoice.service.js';
import { PaymentsService } from './payments.service.js';
import { SubscriptionJobs } from './subscription-jobs.js';
import { WebhookController } from './webhook.controller.js';

@Module({
  imports: [AuthModule, SettingsModule, SubscriptionsModule],
  controllers: [BillingController, WebhookController, AdminPaymentsController],
  providers: [paymentGatewayProvider, PaymentsService, InvoiceService, BillingService, SubscriptionJobs],
  exports: [BillingService, SubscriptionJobs, PaymentsService],
})
export class PaymentsModule {}
