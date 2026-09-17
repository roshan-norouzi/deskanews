import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs `task` on at most one API replica at a time using PostgreSQL advisory locks. */
  async runExclusive(lockId: number, task: () => Promise<void>): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${lockId}) AS locked
    `;
    if (!rows[0]?.locked) return false;
    try {
      await task();
      return true;
    } catch (error) {
      this.logger.error(`Exclusive task failed for lock ${lockId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw error;
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    }
  }
}

export const SCHEDULER_LOCK_IDS = {
  platformFeedMaintenance: 884_001,
  newsroomMaintenance: 884_002,
  socialMaintenance: 884_003,
  automationMaintenance: 884_004,
} as const;
