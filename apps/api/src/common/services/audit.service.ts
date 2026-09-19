import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    tenantId?: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: params.changes as Prisma.InputJsonValue | undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async create(params: {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.activity.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        type: params.type,
        title: params.title,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.activity.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async notify(params: {
    tenantId: string;
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
    dedupeKey?: string;
  }) {
    if (params.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: { tenantId: params.tenantId, userId: params.userId, dedupeKey: params.dedupeKey },
      });
      if (existing) return existing;
    }
    try {
      return await this.prisma.notification.create({ data: params });
    } catch (error) {
      if (params.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.notification.findFirstOrThrow({
          where: { tenantId: params.tenantId, userId: params.userId, dedupeKey: params.dedupeKey },
        });
      }
      throw error;
    }
  }

  async notifyManagers(params: {
    tenantId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
    dedupeKey?: string;
  }) {
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId: params.tenantId, status: 'active', role: { in: ['owner', 'admin', 'manager'] } },
      select: { userId: true },
    });
    return Promise.all(members.map(({ userId }) => this.notify({ ...params, userId })));
  }

  async list(tenantId: string, userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { tenantId, userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(tenantId: string, id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, tenantId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async summary(tenantId: string, userId: string) {
    const [unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where: { tenantId, userId, isRead: false } }),
      this.list(tenantId, userId),
    ]);
    return { unreadCount, items };
  }
}
