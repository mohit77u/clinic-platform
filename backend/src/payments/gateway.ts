import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Payment provider boundary. Business code never imports Razorpay directly. */
export abstract class PaymentGateway {
  /** true for the built-in test gateway (never allowed in production) */
  abstract readonly isDev: boolean;
  /** public key for the checkout widget */
  abstract readonly keyId: string;
  abstract createOrder(amountPaise: number, receipt: string): Promise<{ id: string }>;
  abstract verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  abstract verifyCheckout(orderId: string, paymentId: string, signature: string | undefined): boolean;
}

const hmac = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

function safeEqualHex(a: string, b: string | undefined): boolean {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

@Injectable()
export class RazorpayGateway extends PaymentGateway {
  readonly isDev = false;
  readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    super();
    this.keyId = config.getOrThrow('RAZORPAY_KEY_ID');
    this.keySecret = config.getOrThrow('RAZORPAY_KEY_SECRET');
    this.webhookSecret = config.getOrThrow('RAZORPAY_WEBHOOK_SECRET');
  }

  async createOrder(amountPaise: number, receipt: string) {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1 }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
    return (await res.json()) as { id: string };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    return safeEqualHex(hmac(this.webhookSecret, rawBody), signature);
  }

  verifyCheckout(orderId: string, paymentId: string, signature: string | undefined) {
    return safeEqualHex(hmac(this.keySecret, `${orderId}|${paymentId}`), signature);
  }
}

/** Local/test gateway: orders are fake and signatures use a fixed dev secret. Refuses to run in production. */
@Injectable()
export class DevGateway extends PaymentGateway {
  static readonly SECRET = 'dev-gateway-secret';
  readonly isDev = true;
  readonly keyId = 'dev';

  async createOrder() {
    return { id: `order_dev_${randomBytes(8).toString('hex')}` };
  }
  sign(data: string | Buffer) {
    return hmac(DevGateway.SECRET, data);
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    return safeEqualHex(this.sign(rawBody), signature);
  }
  verifyCheckout(orderId: string, paymentId: string, signature: string | undefined) {
    return safeEqualHex(this.sign(`${orderId}|${paymentId}`), signature);
  }
}

export const paymentGatewayProvider = {
  provide: PaymentGateway,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PaymentGateway => {
    if (config.get('RAZORPAY_KEY_ID') && config.get('RAZORPAY_KEY_SECRET') && config.get('RAZORPAY_WEBHOOK_SECRET')) {
      return new RazorpayGateway(config);
    }
    if (config.get('NODE_ENV') === 'production') throw new Error('Razorpay keys are required in production');
    return new DevGateway();
  },
};
