import { Module } from '@nestjs/common';
import { SecretProtectionService } from '../../modules/smart-publishing/secret-protection.service';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  controllers: [PaymentWebhookController],
  providers: [PaymentSettingsService, SecretProtectionService],
  exports: [PaymentSettingsService],
})
export class PaymentsModule {}
