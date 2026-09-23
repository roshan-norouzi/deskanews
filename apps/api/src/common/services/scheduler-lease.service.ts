import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const GLOBAL_INTERVAL_LEASE_KEY = 'global-interval';

@Injectable()
export class SchedulerLeaseService {
  private readonly logger = new Logger(SchedulerLeaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims (or renews) a short-lived lease so only one API replica runs interval maintenance.
   * Safe with Prisma connection pooling — state lives in Postgres, not the connection.
   */
  async tryAcquire(key: string, holder: string, ttlMs = 90_000): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(5_000, ttlMs));
    const renewed = await this.prisma.schedulerLease.updateMany({
      where: {
        key,
        OR: [{ expiresAt: { lte: now } }, { holder }],
      },
      data: { holder, expiresAt },
    });
    if (renewed.count === 1) return true;

    const current = await this.prisma.schedulerLease.findUnique({ where: { key } });
    const held = current?.holder === holder && current.expiresAt > now;
    if (!held && renewed.count === 0) {
      this.logger.debug(`Lease ${key} held by another replica until ${current?.expiresAt?.toISOString() ?? 'unknown'}`);
    }
    return held;
  }
}
