import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, type AutomationJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

export const AUTOMATION_JOB_TYPES = [
  'news.feed.fetch',
  'news.prepare',
  'news.translate',
  'news.publish',
  'news.send-social',
  'social.feed.fetch',
  'social.prepare',
  'social.cover',
  'social.publish',
] as const;

export type AutomationJobType = (typeof AUTOMATION_JOB_TYPES)[number];
export const AUTOMATION_JOB_STATUSES = ['queued', 'running', 'completed', 'dead', 'cancelled'] as const;
export type AutomationJobStatus = (typeof AUTOMATION_JOB_STATUSES)[number];

/** Executed on Redis when REDIS_URL is set. Postgres row stays the audit record. */
export const FAST_LANE_JOB_TYPES = ['news.prepare', 'social.cover'] as const;

type FastLane = {
  enabled(): boolean;
  push(job: { id: string; type: string; status: string }): Promise<void>;
};

export function retryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.min(10, Math.trunc(attempt)));
  return Math.min(30 * 60_000, 15_000 * (2 ** (safeAttempt - 1)));
}

@Injectable()
export class AutomationJobService {
  private readonly logger = new Logger(AutomationJobService.name);
  private fastLane: FastLane | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly billing?: BillingService,
  ) {}

  bindFastLane(lane: FastLane) {
    this.fastLane = lane;
  }

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
      if (existing && existing.status !== 'dead') return { job: this.publishFastLane(existing), created: false };
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
          if (job) return { job: this.publishFastLane(await this.attachReservation(job)), created: true };
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
      return { job: this.publishFastLane(await this.attachReservation(job)), created: true };
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
        where: {
          status: 'queued',
          availableAt: { lte: now },
          ...(this.fastLane?.enabled() ? { type: { notIn: [...FAST_LANE_JOB_TYPES] } } : {}),
        },
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

  async claimById(workerId: string, id: string): Promise<AutomationJob | null> {
    const now = new Date();
    const lockId = `${workerId}:${randomUUID()}`;
    const result = await this.prisma.automationJob.updateMany({
      where: { id, status: 'queued' },
      data: {
        status: 'running',
        lockedAt: now,
        lockedBy: lockId,
        startedAt: now,
        attempts: { increment: 1 },
        lastError: '',
      },
    });
    if (!result.count) return null;
    return this.prisma.automationJob.findUnique({ where: { id } });
  }

  listFastLaneQueued(take = 50) {
    return this.prisma.automationJob.findMany({
      where: { status: 'queued', type: { in: [...FAST_LANE_JOB_TYPES] } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(100, take)),
      select: { id: true, type: true, status: true },
    });
  }

  private publishFastLane<T extends { id: string; type: string; status: string }>(job: T): T {
    if (!this.fastLane?.enabled() || job.status !== 'queued' || !FAST_LANE_JOB_TYPES.includes(job.type as typeof FAST_LANE_JOB_TYPES[number])) {
      return job;
    }
    void this.fastLane.push(job).catch((error) => {
      this.logger.warn(`Fast-lane push failed for ${job.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
    return job;
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
    if (updated.count === 1) await this.billing?.commit(job.id, job.tenantId);
    return updated.count === 1;
  }

  async fail(job: AutomationJob, error: unknown): Promise<'queued' | 'dead' | 'cancelled' | 'lost'> {
    if (!job.lockedBy) return 'lost';
    const message = (error instanceof Error ? error.message : String(error || 'خطای ناشناخته')).slice(0, 4000);
    // A deleted article or feed will never reappear, so retrying only produces dead jobs and alerts.
    const obsolete = error instanceof NotFoundException;
    const terminal = obsolete || job.attempts >= job.maxAttempts;
    const status = obsolete ? 'cancelled' : terminal ? 'dead' : 'queued';
    const updated = await this.prisma.automationJob.updateMany({
      where: { id: job.id, status: 'running', lockedBy: job.lockedBy },
      data: {
        status,
        availableAt: terminal ? new Date() : new Date(Date.now() + retryDelayMs(job.attempts)),
        completedAt: terminal ? new Date() : null,
        lockedAt: null,
        lockedBy: null,
        lastError: message,
        ...(obsolete ? { dedupeKey: null } : {}),
      },
    });
    if (updated.count === 1 && terminal) await this.billing?.release(job.id, job.tenantId);
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
    const existing = await this.prisma.automationJob.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('کار خودکار یافت نشد');
    if (!['dead', 'cancelled'].includes(existing.status)) throw new BadRequestException('فقط کار متوقف‌شده یا لغوشده قابل تلاش مجدد است');
    const job = await this.prisma.automationJob.update({
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
    return this.publishFastLane(await this.attachReservation(job));
  }

  async retryAllDead(tenantId: string): Promise<{ retried: number }> {
    const dead = this.prisma.automationJob.findMany
      ? await this.prisma.automationJob.findMany({
        where: { tenantId, status: 'dead' },
        select: { id: true },
      })
      : [];
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
    for (const row of dead) {
      const job = await this.prisma.automationJob.findUnique({ where: { id: row.id } });
      if (job?.status === 'queued') await this.attachReservation(job);
    }
    return { retried: result.count };
  }

  private async attachReservation(job: AutomationJob): Promise<AutomationJob> {
    if (!this.billing) return job;
    let reservationId: string | null;
    try {
      reservationId = await this.billing.shadowReserve(job);
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.prisma.automationJob.update({
          where: { id: job.id },
          data: { status: 'cancelled', dedupeKey: null, lastError: error.message.slice(0, 1000) },
        });
      }
      throw error;
    }
    if (!reservationId) return job;
    const current = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
      ? job.payload as Record<string, unknown>
      : {};
    return this.prisma.automationJob.update({
      where: { id: job.id },
      data: { payload: { ...current, reservationId } as Prisma.InputJsonValue },
    });
  }

  async cancel(tenantId: string, id: string) {
    const result = await this.prisma.automationJob.updateMany({
      where: { id, tenantId, status: { in: ['queued', 'dead'] } },
      data: { status: 'cancelled', dedupeKey: null, completedAt: new Date(), lockedAt: null, lockedBy: null },
    });
    if (!result.count) throw new BadRequestException('این کار قابل لغو نیست');
    await this.billing?.release(id, tenantId);
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

  async prune(retentionDays = 14, deadRetentionDays = 30) {
    const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86_400_000);
    const deadCutoff = new Date(Date.now() - Math.max(retentionDays, deadRetentionDays) * 86_400_000);
    return this.prisma.automationJob.deleteMany({
      where: {
        OR: [
          { status: { in: ['completed', 'cancelled'] }, completedAt: { lte: cutoff } },
          { status: 'dead', completedAt: { lte: deadCutoff } },
        ],
      },
    });
  }
}
