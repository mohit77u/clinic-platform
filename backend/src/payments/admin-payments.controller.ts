import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { PageQuery } from '../common/pagination.js';
import { PaymentsService } from './payments.service.js';

class PaymentsQuery extends PageQuery {
  @IsOptional() @IsIn(['created', 'captured', 'failed', 'refunded']) status?: string;
}
class ManualPaymentDto {
  @IsNumber() @Min(1) planId: number;
  @IsString() @MinLength(3) reference: string;
}

@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  list(@Query() q: PaymentsQuery) {
    return this.payments.listAll(q.page, q.limit, q.status);
  }

  /** Cash / bank transfer received outside Razorpay: extends the plan and issues the same GST invoice. */
  @Post('clinics/:clinicId/manual-payment')
  manual(@Param('clinicId') clinicId: string, @Body() dto: ManualPaymentDto, @CurrentUser() u: AuthUser) {
    return this.payments.recordManual(clinicId, dto.planId, dto.reference, u.id);
  }
}
