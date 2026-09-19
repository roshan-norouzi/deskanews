import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_USAGE_METRICS,
  USAGE_UNIT_LABEL,
  isUsageMetricKey,
  type UsageMetricKey,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type UsageMetricDefinitionView = {
  key: UsageMetricKey;
  label: string;
  unitLabel: typeof USAGE_UNIT_LABEL;
  unitCost: number;
  enabled: boolean;
  sortOrder: number;
};

export type TenantUsageMetricView = UsageMetricDefinitionView & {
  quantity: number;
  totalCost: number;
};

export type TenantUsageSummary = {
  tenantId: string;
  metrics: TenantUsageMetricView[];
  totalCost: number;
};

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultMetrics() {
    for (const metric of DEFAULT_USAGE_METRICS) {
      await this.prisma.usageMetricDefinition.upsert({
        where: { key: metric.key },
        create: metric,
        update: {
          label: metric.label,
          unitLabel: metric.unitLabel,
          sortOrder: metric.sortOrder,
        },
      });
    }
  }

  async listMetricDefinitions(): Promise<UsageMetricDefinitionView[]> {
    await this.ensureDefaultMetrics();
    const rows = await this.prisma.usageMetricDefinition.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    return rows
      .filter((row) => isUsageMetricKey(row.key))
      .map((row) => this.toDefinitionView(row));
  }

  async updateMetricDefinitions(
    updates: Array<{ key: UsageMetricKey; unitCost?: number; enabled?: boolean }>,
  ): Promise<UsageMetricDefinitionView[]> {
    for (const update of updates) {
      if (!isUsageMetricKey(update.key)) {
        throw new BadRequestException('فرایند مصرف معتبر نیست');
      }
      if (update.unitCost != null && update.unitCost < 0) {
        throw new BadRequestException('هزینه واحد نمی‌تواند منفی باشد');
      }
      const existing = await this.prisma.usageMetricDefinition.findUnique({ where: { key: update.key } });
      if (!existing) {
        throw new BadRequestException(`فرایند مصرف «${update.key}» تعریف نشده است`);
      }
      await this.prisma.usageMetricDefinition.update({
        where: { key: update.key },
        data: {
          ...(update.unitCost !== undefined && { unitCost: update.unitCost }),
          ...(update.enabled !== undefined && { enabled: update.enabled }),
        },
      });
    }
    return this.listMetricDefinitions();
  }

  async record(tenantId: string, metricKey: UsageMetricKey, quantity = 1) {
    if (!tenantId || quantity <= 0) return;
    try {
      await this.ensureDefaultMetrics();
      await this.prisma.tenantUsageCounter.upsert({
        where: { tenantId_metricKey: { tenantId, metricKey } },
        create: { tenantId, metricKey, quantity },
        update: { quantity: { increment: quantity } },
      });
    } catch (error) {
      this.logger.warn(
        `Usage metric ${metricKey} could not be recorded for tenant ${tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async getTenantUsage(tenantId: string): Promise<TenantUsageSummary> {
    await this.ensureDefaultMetrics();
    const [definitions, counters] = await Promise.all([
      this.prisma.usageMetricDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }),
      this.prisma.tenantUsageCounter.findMany({ where: { tenantId } }),
    ]);
    const counterMap = new Map(counters.map((row) => [row.metricKey, row.quantity]));
    const metrics = definitions
      .filter((definition) => definition.enabled && isUsageMetricKey(definition.key))
      .map((definition) => {
        const quantity = counterMap.get(definition.key) ?? 0;
        const unitCost = definition.unitCost;
        return {
          ...this.toDefinitionView(definition),
          quantity,
          totalCost: quantity * unitCost,
        };
      });
    return {
      tenantId,
      metrics,
      totalCost: metrics.reduce((sum, metric) => sum + metric.totalCost, 0),
    };
  }

  private toDefinitionView(row: {
    key: string;
    label: string;
    unitLabel: string;
    unitCost: number;
    enabled: boolean;
    sortOrder: number;
  }): UsageMetricDefinitionView {
    const defaults = isUsageMetricKey(row.key) ? DEFAULT_USAGE_METRICS.find((metric) => metric.key === row.key) : undefined;
    return {
      key: row.key as UsageMetricKey,
      label: defaults?.label ?? row.label,
      unitLabel: USAGE_UNIT_LABEL,
      unitCost: row.unitCost,
      enabled: row.enabled,
      sortOrder: defaults?.sortOrder ?? row.sortOrder,
    };
  }
}
