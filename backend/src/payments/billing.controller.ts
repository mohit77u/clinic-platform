import { Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ClinicScopeGuard } from '../auth/guards.js';
import { UserRole } from '../common/enums.js';
import { IsNumber, IsString, Min } from 'class-validator';
import { BillingService } from './billing.service.js';
import { DevGateway, PaymentGateway } from './gateway.js';
import { InvoiceService } from './invoice.service.js';
import { PaymentsService } from './payments.service.js';
import { toPaise } from './money.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

class CreateOrderDto {
  @IsNumber() @Min(1) planId: number;
}
class VerifyDto {
  @IsString() orderId: string;
  @IsString() paymentId: string;
  @IsString() signature: string;
}

/** Subscription status is visible to staff too (dashboard banner); everything involving money is owner-only. */
@Roles(UserRole.CLINIC_OWNER, UserRole.CLINIC_STAFF, UserRole.SUPER_ADMIN)
@UseGuards(ClinicScopeGuard)
@Controller('clinic-panel/:clinicId')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: PaymentsService,
    private readonly invoices: InvoiceService,
    private readonly gateway: PaymentGateway,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  @Get('subscription-status')
  status(@Param('clinicId') clinicId: string) {
    return this.billing.status(clinicId);
  }

  @Roles(UserRole.CLINIC_OWNER, UserRole.SUPER_ADMIN)
  @Get('billing')
  async overview(@Param('clinicId') clinicId: string) {
    return {
      status: await this.billing.status(clinicId),
      plans: await this.payments.plansWithPricing(),
      payments: await this.payments.forClinic(clinicId),
      devMode: this.gateway.isDev,
    };
  }

  @Roles(UserRole.CLINIC_OWNER, UserRole.SUPER_ADMIN)
  @Post('billing/orders')
  createOrder(@Param('clinicId') clinicId: string, @Body() dto: CreateOrderDto, @CurrentUser() u: AuthUser) {
    return this.payments.createOrder(clinicId, dto.planId, u.id);
  }

  /** Called by the checkout widget after payment so the UI updates instantly; the webhook is the backup path. */
  @Roles(UserRole.CLINIC_OWNER, UserRole.SUPER_ADMIN)
  @Post('billing/verify')
  @HttpCode(200)
  async verify(@Param('clinicId') clinicId: string, @Body() dto: VerifyDto) {
    if (!this.gateway.verifyCheckout(dto.orderId, dto.paymentId, dto.signature)) throw new NotFoundException('Payment could not be verified');
    const [p] = await this.ds.query(`SELECT amount FROM payments WHERE razorpay_order_id = $1 AND clinic_id = $2`, [dto.orderId, clinicId]);
    if (!p) throw new NotFoundException('Order not found');
    return this.payments.capture({ orderId: dto.orderId, paymentId: dto.paymentId, amountPaise: toPaise(p.amount) });
  }

  /** Test-mode only: pretends the owner paid, using the built-in dev gateway. Not routable with real Razorpay keys. */
  @Roles(UserRole.CLINIC_OWNER, UserRole.SUPER_ADMIN)
  @Post('billing/orders/:orderId/dev-pay')
  @HttpCode(200)
  async devPay(@Param('clinicId') clinicId: string, @Param('orderId') orderId: string) {
    if (!(this.gateway instanceof DevGateway)) throw new NotFoundException();
    const [p] = await this.ds.query(`SELECT amount FROM payments WHERE razorpay_order_id = $1 AND clinic_id = $2`, [orderId, clinicId]);
    if (!p) throw new NotFoundException('Order not found');
    const paymentId = `pay_dev_${orderId.slice(-8)}`;
    return this.payments.capture({ orderId, paymentId, amountPaise: toPaise(p.amount) });
  }

  @Roles(UserRole.CLINIC_OWNER, UserRole.SUPER_ADMIN)
  @Get('billing/invoices/:paymentId')
  @Header('Content-Type', 'application/pdf')
  async invoice(@Param('clinicId') clinicId: string, @Param('paymentId') paymentId: string, @Res() res: Response) {
    if (!/^\d+$/.test(paymentId)) throw new NotFoundException('Invoice not available');
    const { data, invoiceNo } = await this.invoices.read(clinicId, paymentId);
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceNo.replace(/\//g, '-')}.pdf"`);
    res.end(data);
  }
}
