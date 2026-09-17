import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from './audit.service';

interface IntegrationResult {
  tenantId: string;
  key: string;
  type: string;
  name: string;
  latencyMs?: number;
  configured?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class IntegrationHealthService {
  private readonly logger = new Logger(IntegrationHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async success(params: IntegrationResult) {
    const previous = await this.prisma.integrationHealth.findUnique({
      where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
    });
    const now = new Date();
    const row = await this.prisma.integrationHealth.upsert({
      where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
      create: {
        tenantId: params.tenantId,
        key: params.key,
        type: params.type,
        name: params.name,
        status: 'healthy',
        configured: params.configured ?? true,
        latencyMs: params.latencyMs,
        lastCheckedAt: now,
        lastSuccessAt: now,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        type: params.type,
        name: params.name,
        status: 'healthy',
        configured: params.configured ?? true,
        consecutiveFailures: 0,
        latencyMs: params.latencyMs,
        lastCheckedAt: now,
        lastSuccessAt: now,
        lastError: '',
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    if (previous && previous.consecutiveFailures >= 3) {
      await this.notifications.notifyManagers({
        tenantId: params.tenantId,
        title: 'اتصال دوباره برقرار شد',
        message: `${params.name} پس از اختلال دوباره در دسترس است.`,
        type: 'success',
        link: '/publishing/operations',
        dedupeKey: `integration-recovered:${params.key}:${previous.lastFailureAt?.toISOString() || previous.id}`,
      }).catch((error) => this.logger.warn(`Recovery notification could not be created: ${error instanceof Error ? error.message : 'unknown error'}`));
    }
    return row;
  }

  async failure(params: IntegrationResult & { error: unknown }) {
    const now = new Date();
    const message = (params.error instanceof Error ? params.error.message : String(params.error || 'خطای ناشناخته')).slice(0, 2000);
    await this.prisma.integrationHealth.upsert({
      where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
      create: {
        tenantId: params.tenantId,
        key: params.key,
        type: params.type,
        name: params.name,
        status: 'degraded',
        configured: params.configured ?? true,
        consecutiveFailures: 1,
        latencyMs: params.latencyMs,
        lastCheckedAt: now,
        lastFailureAt: now,
        lastError: message,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        type: params.type,
        name: params.name,
        status: 'degraded',
        configured: params.configured ?? true,
        consecutiveFailures: { increment: 1 },
        latencyMs: params.latencyMs,
        lastCheckedAt: now,
        lastFailureAt: now,
        lastError: message,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    const row = await this.prisma.integrationHealth.findUniqueOrThrow({
      where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
    });
    const result = row.consecutiveFailures >= 3 && row.status !== 'down'
      ? await this.prisma.integrationHealth.update({ where: { id: row.id }, data: { status: 'down' } })
      : row;
    if (row.consecutiveFailures === 3) {
      await this.notifications.notifyManagers({
        tenantId: params.tenantId,
        title: 'اختلال پایدار در اتصال',
        message: `${params.name} سه بار پیاپی ناموفق بود: ${message}`,
        type: 'error',
        link: '/publishing/operations',
        dedupeKey: `integration-down:${params.key}:${row.lastFailureAt?.toISOString() || row.id}`,
      }).catch((error) => this.logger.warn(`Failure notification could not be created: ${error instanceof Error ? error.message : 'unknown error'}`));
    }
    return result;
  }

  list(tenantId: string) {
    return this.prisma.integrationHealth.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }
}
