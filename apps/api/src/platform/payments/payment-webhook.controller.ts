import { Body, Controller, Headers, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Public } from '../../common/decorators/metadata.decorator';
import { BillingService } from '../../common/services/billing.service';
import { paymentSignatureMatches } from './payment-signature';
import { PaymentSettingsService } from './payment-settings.service';

@Controller('payments')
export class PaymentWebhookController {
  constructor(
    private readonly billing: BillingService,
    private readonly paymentSettings: PaymentSettingsService,
  ) {}

  @Public()
  @Post('webhook')
  async confirm(
    @Headers('x-payment-signature') signature: string | undefined,
    @Body() body: { paymentId?: string },
  ) {
    const settings = await this.paymentSettings.getPublic();
    if (!settings.enabled) throw new ServiceUnavailableException('درگاه پرداخت غیرفعال است');
    const secret = await this.paymentSettings.resolveWebhookSecret();
    if (!secret) throw new ServiceUnavailableException('درگاه پرداخت پیکربندی نشده است');
    const paymentId = String(body?.paymentId || '').trim();
    if (!paymentSignatureMatches(secret, paymentId, signature || '')) {
      throw new UnauthorizedException('امضای درگاه نامعتبر است');
    }
    return this.billing.confirmPayment(paymentId);
  }
}
