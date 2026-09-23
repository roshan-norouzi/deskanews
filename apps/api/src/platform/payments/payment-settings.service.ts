import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretProtectionService } from '../../modules/smart-publishing/secret-protection.service';

type BillingStored = {
  payment_provider?: string;
  payment_enabled?: string;
  payment_webhook_secret?: string;
};

function cleanObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

@Injectable()
export class PaymentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretProtectionService,
  ) {}

  async resolveWebhookSecret(): Promise<string> {
    const env = process.env.PAYMENT_WEBHOOK_SECRET?.trim() ?? '';
    if (env) return env;
    const stored = await this.loadStored();
    return stored.webhookSecret;
  }

  async getPublic() {
    const env = process.env.PAYMENT_WEBHOOK_SECRET?.trim() ?? '';
    const stored = await this.loadStored();
    const configured = Boolean(env || stored.webhookSecret);
    return {
      provider: stored.provider,
      enabled: stored.enabled,
      webhookConfigured: configured,
      webhookSource: env ? 'environment' : stored.webhookSecret ? 'database' : 'none',
      webhookPath: '/api/payments/webhook',
      signatureHeader: 'x-payment-signature',
      billingEnforcement: process.env.BILLING_ENFORCE !== 'false',
    };
  }

  async save(input: { provider?: string; enabled?: boolean; webhookSecret?: string }) {
    const current = await this.loadStored();
    const nextProvider = input.provider?.trim() || current.provider;
    const nextEnabled = typeof input.enabled === 'boolean' ? input.enabled : current.enabled;
    const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    const settings = cleanObject(row?.settings);
    const billing: BillingStored = {
      payment_provider: nextProvider,
      payment_enabled: nextEnabled ? 'true' : 'false',
    };
    if (typeof input.webhookSecret === 'string') {
      const trimmed = input.webhookSecret.trim();
      if (trimmed) billing.payment_webhook_secret = this.secrets.encrypt(trimmed);
    } else if (current.encryptedSecret) {
      billing.payment_webhook_secret = current.encryptedSecret;
    }

    await this.prisma.platformConfig.upsert({
      where: { id: 'default' },
      create: { settings: { ...settings, billing } as Prisma.InputJsonValue },
      update: { settings: { ...settings, billing } as Prisma.InputJsonValue },
    });
    return this.getPublic();
  }

  private async loadStored() {
    const row = await this.prisma.platformConfig.findUnique({ where: { id: 'default' } });
    const billing = cleanObject(cleanObject(row?.settings).billing) as BillingStored;
    const encrypted = typeof billing.payment_webhook_secret === 'string' ? billing.payment_webhook_secret : '';
    const decrypted = encrypted ? this.secrets.decrypt(encrypted) : '';
    return {
      provider: typeof billing.payment_provider === 'string' && billing.payment_provider.trim()
        ? billing.payment_provider.trim()
        : 'manual',
      enabled: billing.payment_enabled !== 'false',
      webhookSecret: decrypted.trim(),
      encryptedSecret: encrypted,
    };
  }
}
