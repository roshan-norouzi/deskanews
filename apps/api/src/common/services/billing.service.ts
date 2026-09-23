import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PLATFORM_PLANS, resolveTokenTopUpPackage, TOKEN_TOP_UP_PACKAGES } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

const JOB_METRIC: Partial<Record<string, { metricKey: string; fallback: number }>> = {
  'news.prepare': { metricKey: 'news.prepared', fallback: 1 },
  'news.translate': { metricKey: 'news.translated', fallback: 1 },
  'news.publish': { metricKey: 'news.published', fallback: 1 },
  'news.send-social': { metricKey: 'news.sent-social', fallback: 1 },
  'social.prepare': { metricKey: 'social.prepared', fallback: 1 },
  'social.cover': { metricKey: 'social.cover', fallback: 1 },
  'social.publish': { metricKey: 'social.published', fallback: 1 },
};

type LedgerRow = { id: string; entryType: string; amount: number; createdAt: Date };

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  enforced(): boolean {
    return process.env.BILLING_ENFORCE !== 'false';
  }

  async shadowReserve(job: { id: string; tenantId: string; type: string }): Promise<string | null> {
    const price = JOB_METRIC[job.type];
    if (!price) return null;
    try {
      return await this.prisma.$transaction((tx) => this.reserve(tx, job.tenantId, job.id, price));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`Token reserve skipped for ${job.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  async commit(jobId: string, tenantId: string): Promise<void> {
    await this.settle(jobId, tenantId, 'commit');
  }

  async release(jobId: string, tenantId: string): Promise<void> {
    await this.settle(jobId, tenantId, 'release');
  }

  listTokenPackages() {
    return TOKEN_TOP_UP_PACKAGES;
  }

  async wallet(tenantId: string) {
    const snapshot = await this.walletSnapshot(tenantId);
    return snapshot.wallet;
  }

  async walletSnapshot(tenantId: string) {
    await this.prisma.$transaction((tx) => this.ensurePeriodGrant(tx, tenantId));
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, name: true },
    });
    if (!tenant) throw new BadRequestException('سازمان یافت نشد');
    const plan = tenant.plan ?? 'starter';
    const monthlyTokens = PLATFORM_PLANS[plan]?.monthlyTokens ?? PLATFORM_PLANS.starter.monthlyTokens;
    const wallet = await this.prisma.tenantWallet.findUnique({ where: { tenantId } });
    const balanceTokens = wallet?.balanceTokens ?? 0;
    const reservedTokens = wallet?.reservedTokens ?? 0;
    const consumedTokens = wallet?.consumedTokens ?? 0;
    const [recentLedger, pendingPayments] = await Promise.all([
      this.prisma.walletLedger.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, entryType: true, amount: true, metricKey: true, createdAt: true },
      }),
      this.prisma.paymentIntent.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, amountRials: true, tokenAmount: true, status: true, createdAt: true, paidAt: true },
      }),
    ]);
    return {
      tenantId,
      plan,
      monthlyTokens,
      enforcement: this.enforced(),
      wallet: wallet ?? { tenantId, balanceTokens: 0, reservedTokens: 0, consumedTokens: 0, updatedAt: new Date() },
      availableTokens: balanceTokens - reservedTokens,
      balanceTokens,
      reservedTokens,
      consumedTokens,
      recentLedger,
      pendingPayments,
      packages: TOKEN_TOP_UP_PACKAGES,
    };
  }

  createPaymentForPackage(tenantId: string, packageId: string) {
    const pack = resolveTokenTopUpPackage(packageId);
    if (!pack) throw new BadRequestException('بستهٔ توکن معتبر نیست');
    return this.createPayment(tenantId, pack.amountRials, pack.tokenAmount);
  }

  async credit(tenantId: string, amount: number, idempotencyKey: string) {
    if (!Number.isInteger(amount) || amount <= 0) throw new BadRequestException('مقدار توکن باید عدد صحیح مثبت باشد');
    return this.prisma.$transaction(async (tx) => {
      await tx.tenantWallet.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
      const existing = await tx.walletLedger.findUnique({ where: { idempotencyKey } });
      if (existing) return tx.tenantWallet.findUnique({ where: { tenantId } });
      await tx.walletLedger.create({
        data: { tenantId, entryType: 'credit', amount, idempotencyKey, metricKey: 'wallet.credit' },
      });
      return tx.tenantWallet.update({
        where: { tenantId },
        data: { balanceTokens: { increment: amount } },
      });
    });
  }

  async createPayment(tenantId: string, amountRials: number, tokenAmount: number) {
    if (amountRials <= 0 || tokenAmount <= 0) throw new BadRequestException('مبلغ و تعداد توکن باید مثبت باشد');
    return this.prisma.paymentIntent.create({
      data: { tenantId, amountRials, tokenAmount, provider: 'manual', status: 'pending' },
    });
  }

  async confirmPayment(id: string) {
    const payment = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!payment) throw new BadRequestException('پرداخت یافت نشد');
    if (payment.status === 'paid') return payment;
    await this.credit(payment.tenantId, payment.tokenAmount, `payment:${payment.id}`);
    return this.prisma.paymentIntent.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    });
  }

  private async reserve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    jobId: string,
    price: { metricKey: string; fallback: number },
  ): Promise<string | null> {
    const amount = await this.price(tx, price.metricKey, price.fallback);
    if (amount <= 0) return null;
    await this.ensurePeriodGrant(tx, tenantId);
    const wallet = await tx.tenantWallet.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
    const entries = await tx.walletLedger.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, entryType: true, amount: true, createdAt: true },
    });
    const open = openReserve(entries);
    if (open) return open.id;
    const available = (wallet?.balanceTokens ?? 0) - (wallet?.reservedTokens ?? 0);
    if (this.enforced() && available < amount) {
      throw new BadRequestException('توکن سازمان برای این کار کافی نیست');
    }
    const generation = entries.filter((entry) => entry.entryType === 'reserve').length + 1;
    const row = await tx.walletLedger.create({
      data: {
        tenantId,
        jobId,
        entryType: 'reserve',
        amount,
        metricKey: price.metricKey,
        idempotencyKey: `reserve:${jobId}:${generation}`,
      },
      select: { id: true },
    });
    await tx.tenantWallet.update({
      where: { tenantId },
      data: { reservedTokens: { increment: amount } },
    });
    return row.id;
  }

  private async price(tx: Prisma.TransactionClient, metricKey: string, fallback: number): Promise<number> {
    const lookup = tx.usageMetricDefinition?.findUnique;
    if (!lookup) return fallback;
    const row = await lookup({ where: { key: metricKey } });
    if (!row) return fallback;
    return row.enabled ? Math.max(0, Math.round(Number(row.unitCost))) : 0;
  }

  private async ensurePeriodGrant(tx: Prisma.TransactionClient, tenantId: string) {
    if (!tx.tenant?.findUnique) return;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    const monthly = PLATFORM_PLANS[tenant?.plan ?? 'starter']?.monthlyTokens ?? PLATFORM_PLANS.starter.monthlyTokens;
    const period = new Date().toISOString().slice(0, 7);
    const idempotencyKey = `grant:${tenantId}:${period}`;
    const existing = await tx.walletLedger.findUnique({ where: { idempotencyKey } });
    if (existing) return;
    await tx.tenantWallet.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
    await tx.walletLedger.create({
      data: { tenantId, entryType: 'credit', amount: monthly, metricKey: 'plan.grant', idempotencyKey },
    });
    await tx.tenantWallet.update({
      where: { tenantId },
      data: { balanceTokens: { increment: monthly } },
    });
  }

  private async settle(jobId: string, tenantId: string, entryType: 'commit' | 'release'): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const entries = await tx.walletLedger.findMany({
          where: { jobId, tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, entryType: true, amount: true, createdAt: true },
        });
        const open = openReserve(entries);
        if (!open) return;
        await tx.walletLedger.create({
          data: {
            tenantId,
            jobId,
            entryType,
            amount: open.amount,
            idempotencyKey: `${entryType}:${open.id}`,
          },
        });
        await tx.tenantWallet.update({
          where: { tenantId },
          data: {
            reservedTokens: { decrement: open.amount },
            ...(entryType === 'commit'
              ? { balanceTokens: { decrement: open.amount }, consumedTokens: { increment: open.amount } }
              : {}),
          },
        });
      });
    } catch (error) {
      this.logger.warn(`Token ${entryType} skipped for ${jobId}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}

function openReserve(entries: LedgerRow[]): LedgerRow | undefined {
  let open: LedgerRow | undefined;
  for (const entry of entries) {
    if (entry.entryType === 'reserve') open = entry;
    if (entry.entryType === 'commit' || entry.entryType === 'release') open = undefined;
  }
  return open;
}
