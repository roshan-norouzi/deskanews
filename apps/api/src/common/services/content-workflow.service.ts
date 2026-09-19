import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type UnifiedContentStage = 'inbox' | 'preparing' | 'ready' | 'publishing' | 'routed' | 'published' | 'failed' | 'archived' | 'rejected';

export function unifiedContentStage(entityType: string, status: string): UnifiedContentStage {
  if (status === 'archived') return 'archived';
  if (status === 'rejected') return 'rejected';
  if (['failed', 'publish_failed', 'social_failed', 'dead'].includes(status) || status.endsWith('_failed')) return 'failed';
  if (['processing', 'social_processing'].includes(status)) return 'preparing';
  if (status === 'publishing') return 'publishing';
  if (status === 'social_sent') return 'routed';
  if (status === 'published' || status.endsWith('_published')) return 'published';
  if (status === 'ready') return 'ready';
  if (entityType === 'social-article' && status === 'pending') return 'inbox';
  return 'inbox';
}

@Injectable()
export class ContentWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    tenantId: string;
    entityType: 'news-article' | 'social-article';
    entityId: string;
    fromStatus?: string | null;
    toStatus: string;
    action: string;
    actorType?: 'user' | 'automation' | 'system';
    actorId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }) {
    const stage = unifiedContentStage(params.entityType, params.toStatus);
    const metadata = (params.metadata ?? {}) as Prisma.InputJsonValue;
    return this.prisma.$transaction([
      this.prisma.contentWorkflowEvent.create({
        data: {
          tenantId: params.tenantId,
          entityType: params.entityType,
          entityId: params.entityId,
          fromStatus: params.fromStatus ?? null,
          toStatus: params.toStatus,
          stage,
          action: params.action,
          actorType: params.actorType ?? 'system',
          actorId: params.actorId ?? null,
          metadata,
        },
      }),
      this.prisma.activity.create({
        data: {
          tenantId: params.tenantId,
          userId: params.actorType === 'user' ? params.actorId ?? null : null,
          type: `content.${params.action}`,
          title: params.title || `${params.entityType} به وضعیت ${params.toStatus} منتقل شد`,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata,
        },
      }),
    ]);
  }

  list(tenantId: string, take = 100) {
    return this.prisma.contentWorkflowEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, Math.trunc(take))),
    });
  }
}
