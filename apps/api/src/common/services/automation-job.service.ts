import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AutomationJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const AUTOMATION_JOB_TYPES = [
  'news.feed.fetch',
  'news.prepare',
  'news.publish',
  'news.send-social',
  'social.feed.fetch',
  'social.prepare',
  'social.cover',
  'social.publish',
  'wordpress.importance.evaluate',
  'wordpress.importance.reevaluate-all',
  'wordpress.importance.learn',
] as const;

export type AutomationJobType = (typeof AUTOMATION_JOB_TYPES)[number];
export const AUTOMATION_JOB_STATUSES = ['queued', 'running', 'completed', 'dead', 'cancelled'] as const;
export type AutomationJobStatus = (typeof AUTOMATION_JOB_STATUSES)[number];

export function retryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.min(10, Math.trunc(attempt)));
  return Math.min(30 * 60_000, 15_000 * (2 ** (safeAttempt - 1)));
}

@Injectable()
export class AutomationJobService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(params: {
    tenantId: string;
    type: AutomationJobType;
    payload: Record<string, unknown>;
    dedupeKey?: string;
    retryDead?: boolean;
    priority?: number;
    maxAttempts?: number;
    availableAt?: Date;
  }): Promise<{ job: AutomationJob; created: boolean }> {
    if (!AUTOMATION_JOB_TYPES.includes(params.type)) throw new BadRequestException('نوع کار خودکار معتبر نیست');
    const dedupeKey = params.dedupeKey?.trim().slice(0, 300) || null;
    if (dedupeKey) {
      const existing = await this.prisma.automationJob.findFirst({
        where: {
          tenantId: params.tenantId,
          type: params.type,
          dedupeKey,
          status: { in: ['queued', 'running', 'dead'] },
        },
      });
      if (existing && existing.status !== 'dead') return { job: existing, created: false };
      if (existing?.status === 'dead' && params.retryDead) {
        const reset = await this.prisma.automationJob.updateMany({
          where: { id: existing.id, status: 'dead' },
          data: {
            status: 'queued',
            attempts: 0,
            availableAt: params.availableAt ?? new Date(),
            startedAt: null,
            completedAt: null,
            lockedAt: null,
            lockedBy: null,
            lastError: '',
            payload: params.payload as Prisma.InputJsonValue,
            priority: Math.max(-100, Math.min(100, Math.trunc(params.priority ?? existing.priority))),
            maxAttempts: Math.max(1, Math.min(20, Math.trunc(params.maxAttempts ?? existing.maxAttempts))),
          },
        });
        if (reset.count === 1) {
          const job = await this.prisma.automationJob.findUnique({ where: { id: existing.id } });
          if (job) return { job, created: true };
        }
        const current = await this.prisma.automationJob.findUnique({ where: { id: existing.id } });
        if (current) return { job: current, created: false };
      }
      if (existing) return { job: existing, created: false };
    }

    try {
      const job = await this.prisma.automationJob.create({
        data: {
          tenantId: params.tenantId,
          type: params.type,
          payload: params.payload as Prisma.InputJsonValue,
          dedupeKey,
          priority: Math.max(-100, Math.min(100, Math.trunc(params.priority ?? 0))),
          maxAttempts: Math.max(1, Math.min(20, Math.trunc(params.maxAttempts ?? 5))),
          availableAt: params.availableAt ?? new Date(),
        },
      });
      return { job, created: true };
    } catch (error) {
      if (dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.automationJob.findFirst({
          where: { tenantId: params.tenantId, type: params.type, dedupeKey },
        });
        if (existing) return { job: existing, created: false };
      }
      throw error;
    }
  }

  /** Atomically claims due jobs. Competing API replicas can never own the same row. */
  async claim(workerId: string, limit = 4): Promise<AutomationJob[]> {
    const claimed: AutomationJob[] = [];
    const now = new Date();
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    for (let scan = 0; scan < safeLimit * 4 && claimed.length < safeLimit; scan += 1) {
      const candidate = await this.prisma.automationJob.findFirst({
        where: { status: 'queued', availableAt: { lte: now } },
        orderBy: [{ priority: 'desc' }, { availableAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!candidate) break;
      const lockId = `${workerId}:${randomUUID()}`;
      const result = await this.prisma.automationJob.updateMany({
        where: { id: candidate.id, status: 'queued', availableAt: { lte: now } },
        data: {
          status: 'running',
          lockedAt: now,
          lockedBy: lockId,
          startedAt: now,
          attempts: { increment: 1 },
          lastError: '',
        },
      });
      if (!result.count) continue;
      const job = await this.prisma.automationJob.findUnique({ where: { id: candidate.id } });
      if (job) claimed.push(job);
    }
    return claimed;
  }

  async complete(job: AutomationJob, result?: unknown): Promise<boolean> {
    // The lock token is a lease, not merely diagnostic metadata. A worker that
    // exceeded the stale timeout must not complete a later worker's claim.
    if (!job.lockedBy) return false;
    const updated = await this.prisma.automationJob.updateMany({
      where: { id: job.id, status: 'running', lockedBy: job.lockedBy },
      data: {
        status: 'completed',
        result: result === undefined ? Prisma.DbNull : result as Prisma.InputJsonValue,
        dedupeKey: null,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: '',
      },
    });
    return updated.count === 1;
  }

  async fail(job: AutomationJob, error: unknown): Promise<'queued' | 'dead' | 'lost'> {
    if (!job.lockedBy) return 'lost';
    const message = (error instanceof Error ? error.message : String(error || 'خطای ناشناخته')).slice(0, 4000);
    const terminal = job.attempts >= job.maxAttempts;
    const status = terminal ? 'dead' : 'queued';
    const updated = await this.prisma.automationJob.updateMany({
      where: { id: job.id, status: 'running', lockedBy: job.lockedBy },
      data: {
        status,
        availableAt: terminal ? new Date() : new Date(Date.now() + retryDelayMs(job.attempts)),
        completedAt: terminal ? new Date() : null,
        lockedAt: null,
        lockedBy: null,
        lastError: message,
      },
    });
    return updated.count === 1 ? status : 'lost';
  }

  async recoverStale(staleAfterMs = 20 * 60_000): Promise<{ recovered: number; dead: number }> {
    const stale = await this.prisma.automationJob.findMany({
      where: { status: 'running', lockedAt: { lte: new Date(Date.now() - staleAfterMs) } },
      take: 100,
    });
    let recovered = 0;
    let dead = 0;
    for (const job of stale) {
      const status = await this.fail(job, new Error('پردازش قبلی پیش از تکمیل متوقف شد و کار بازیابی شد'));
      if (status === 'dead') dead += 1;
      else if (status === 'queued') recovered += 1;
    }
    return { recovered, dead };
  }

  async retry(tenantId: string, id: string) {
    const job = await this.prisma.automationJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('کار خودکار یافت نشد');
    if (!['dead', 'cancelled'].includes(job.status)) throw new BadRequestException('فقط کار متوقف‌شده یا لغوشده قابل تلاش مجدد است');
    return this.prisma.automationJob.update({
      where: { id },
      data: {
        status: 'queued',
        attempts: 0,
        availableAt: new Date(),
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
        lastError: '',
      },
    });
  }

  async retryAllDead(tenantId: string): Promise<{ retried: number }> {
    const result = await this.prisma.automationJob.updateMany({
      where: { tenantId, status: 'dead' },
      data: {
        status: 'queued',
        attempts: 0,
        availableAt: new Date(),
        startedAt: null,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
        lastError: '',
      },
    });
    return { retried: result.count };
  }

  async cancel(tenantId: string, id: string) {
    const result = await this.prisma.automationJob.updateMany({
      where: { id, tenantId, status: { in: ['queued', 'dead'] } },
      data: { status: 'cancelled', dedupeKey: null, completedAt: new Date(), lockedAt: null, lockedBy: null },
    });
    if (!result.count) throw new BadRequestException('این کار قابل لغو نیست');
    return { ok: true };
  }

  list(tenantId: string, status?: string, take = 100) {
    const normalizedStatus = status?.trim();
    if (normalizedStatus && !AUTOMATION_JOB_STATUSES.includes(normalizedStatus as AutomationJobStatus)) {
      throw new BadRequestException('وضعیت صف معتبر نیست');
    }
    return this.prisma.automationJob.findMany({
      where: { tenantId, ...(normalizedStatus ? { status: normalizedStatus } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(1, Math.min(200, Math.trunc(take))),
    });
  }

  async stats(tenantId: string) {
    const rows = await this.prisma.automationJob.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const stats = { queued: 0, running: 0, completed: 0, dead: 0, cancelled: 0 };
    for (const row of rows) {
      if (row.status in stats) stats[row.status as keyof typeof stats] = row._count._all;
    }
    return stats;
  }

  async prune(retentionDays = 14) {
    const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86_400_000);
    return this.prisma.automationJob.deleteMany({
      where: { status: { in: ['completed', 'cancelled'] }, completedAt: { lte: cutoff } },
    });
  }
}
