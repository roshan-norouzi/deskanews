import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_USAGE_METRICS, type UsageMetricKey } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type UsageMetricDefinitionView = {
  key: string;
  label: string;
  unitLabel: string;
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
        update: {},
      });
    }
  }

  async listMetricDefinitions(): Promise<UsageMetricDefinitionView[]> {
    await this.ensureDefaultMetrics();
    const rows = await this.prisma.usageMetricDefinition.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => this.toDefinitionView(row));
  }

  async updateMetricDefinitions(
    updates: Array<Partial<UsageMetricDefinitionView> & { key: string }>,
  ): Promise<UsageMetricDefinitionView[]> {
    for (const update of updates) {
      if (!update.key?.trim()) {
        throw new BadRequestException('کلید مصرف معتبر نیست');
      }
      if (update.unitCost != null && update.unitCost < 0) {
        throw new BadRequestException('هزینه واحد نمی‌تواند منفی باشد');
      }
      await this.prisma.usageMetricDefinition.upsert({
        where: { key: update.key },
        create: {
          key: update.key,
          label: update.label?.trim() || update.key,
          unitLabel: update.unitLabel?.trim() || 'توکن',
          unitCost: update.unitCost ?? 1,
          enabled: update.enabled ?? true,
          sortOrder: update.sortOrder ?? 0,
        },
        update: {
          ...(update.label !== undefined && { label: update.label.trim() || update.key }),
          ...(update.unitLabel !== undefined && { unitLabel: update.unitLabel.trim() || 'توکن' }),
          ...(update.unitCost !== undefined && { unitCost: update.unitCost }),
          ...(update.enabled !== undefined && { enabled: update.enabled }),
          ...(update.sortOrder !== undefined && { sortOrder: update.sortOrder }),
        },
      });
    }
    return this.listMetricDefinitions();
  }

  async record(tenantId: string, metricKey: UsageMetricKey | string, quantity = 1) {
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
      .filter((definition) => definition.enabled)
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
    return {
      key: row.key,
      label: row.label,
      unitLabel: row.unitLabel,
      unitCost: row.unitCost,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
    };
  }
}
