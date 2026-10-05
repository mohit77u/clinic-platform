import { BadRequestException, Controller, Headers, HttpCode, Logger, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { PaymentGateway } from './gateway.js';
import { PaymentsService } from './payments.service.js';

interface RazorpayEvent {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; status: string } } };
}

@Public()
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly payments: PaymentsService,
  ) {}

  @Post('razorpay')
  @HttpCode(200)
  async razorpay(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    const raw = req.rawBody;
    if (!raw || !this.gateway.verifyWebhook(raw, signature)) throw new UnauthorizedException('Invalid signature');

    const evt = req.body as RazorpayEvent;
    if (evt.event !== 'payment.captured' && evt.event !== 'order.paid') return { ignored: true };
    const pay = evt.payload?.payment?.entity;
    if (!pay?.order_id || !pay.id) throw new BadRequestException('Malformed event');

    try {
      const r = await this.payments.capture({ orderId: pay.order_id, paymentId: pay.id, amountPaise: pay.amount });
      return { ok: true, duplicate: r.alreadyProcessed };
    } catch (e) {
      // Unknown orders (e.g. from another system on the same account) must not be retried forever.
      if (e instanceof NotFoundException) {
        this.logger.warn(`Webhook for unknown order ${pay.order_id}`);
        return { ignored: true };
      }
      throw e;
    }
  }
}
