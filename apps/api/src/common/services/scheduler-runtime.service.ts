import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { resolveProcessRole } from '../process-role';
import { GLOBAL_INTERVAL_LEASE_KEY, SchedulerLeaseService } from './scheduler-lease.service';

@Injectable()
export class SchedulerRuntimeService {
  private readonly logger = new Logger(SchedulerRuntimeService.name);
  private readonly workerId = `${hostname()}:${process.pid}`;

  constructor(
    private readonly config: ConfigService,
    private readonly leases: SchedulerLeaseService,
  ) {}

  backgroundJobsEnabled(): boolean {
    if (resolveProcessRole(this.config.get<string>('DESKA_PROCESS_ROLE')) === 'api') return false;
    const raw = this.config.get<string>('DESKA_BACKGROUND_JOBS_ENABLED', 'true');
    return raw !== '0' && raw.toLowerCase() !== 'false';
  }

  intervalMaintenanceEnabled(): boolean {
    const raw = this.config.get<string>('DESKA_INTERVAL_MAINTENANCE_ENABLED', 'true');
    return this.backgroundJobsEnabled() && raw !== '0' && raw.toLowerCase() !== 'false';
  }

  automationWorkerEnabled(): boolean {
    return this.backgroundJobsEnabled();
  }

  /** API pods only enqueue. `all` (local) and `worker` still run the work in-process. */
  runsHeavyWorkInline(): boolean {
    return resolveProcessRole(this.config.get<string>('DESKA_PROCESS_ROLE')) !== 'api';
  }

  /** Runs maintenance only on the replica that holds the global interval lease. */
  async runIntervalMaintenance(task: string, fn: () => Promise<void>): Promise<void> {
    if (!this.intervalMaintenanceEnabled()) return;
    if (!(await this.leases.tryAcquire(GLOBAL_INTERVAL_LEASE_KEY, this.workerId))) return;
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `${task} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw error;
    }
  }
}
