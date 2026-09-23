import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { RedisCache } from '../../common/redis/redis-cache';
import { AutomationJobService, FAST_LANE_JOB_TYPES } from '../../common/services/automation-job.service';
import { SchedulerRuntimeService } from '../../common/services/scheduler-runtime.service';
import { PublishingAutomationProcessor } from './publishing-automation.processor';

export const FAST_LANE_QUEUE = 'deska-fast-lane';

@Injectable()
export class FastLaneQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FastLaneQueue.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly cache: RedisCache,
    private readonly runtime: SchedulerRuntimeService,
    private readonly jobs: AutomationJobService,
    private readonly processor: PublishingAutomationProcessor,
  ) {}

  enabled(): boolean {
    return this.cache.enabled();
  }

  async push(job: { id: string; type: string; status: string }): Promise<void> {
    if (!this.enabled() || job.status !== 'queued' || !FAST_LANE_JOB_TYPES.includes(job.type as typeof FAST_LANE_JOB_TYPES[number])) return;
    const queue = this.ensureQueue();
    const existing = await queue.getJob(job.id);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children') return;
      await existing.remove().catch(() => undefined);
    }
    await queue.add('run', { automationJobId: job.id }, {
      jobId: job.id,
      removeOnComplete: 200,
      removeOnFail: 200,
    });
  }

  onModuleInit() {
    this.jobs.bindFastLane(this);
    if (!this.enabled() || !this.runtime.backgroundJobsEnabled()) return;
    this.worker = new Worker(
      FAST_LANE_QUEUE,
      async (job: Job<{ automationJobId: string }>) => {
        await this.processor.executeById(job.data.automationJobId);
      },
      { connection: new Redis(this.cache.url(), { maxRetriesPerRequest: null }), concurrency: 2 },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`Fast-lane worker error: ${error.message}`);
    });
    this.sweeper = setInterval(() => void this.sweep(), 15_000);
    void this.sweep();
  }

  async onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    await this.worker?.close();
    await this.queue?.close();
  }

  private ensureQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(FAST_LANE_QUEUE, { connection: { url: this.cache.url() } });
    }
    return this.queue;
  }

  private async sweep() {
    try {
      const pending = await this.jobs.listFastLaneQueued(50);
      for (const job of pending) await this.push(job);
    } catch (error) {
      this.logger.warn(`Fast-lane sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
