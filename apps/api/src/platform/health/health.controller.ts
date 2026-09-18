import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/metadata.decorator';
import { ObjectStorageService } from '../../common/services/object-storage.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private storage: ObjectStorageService,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', live: true, version: process.env.APP_VERSION ?? '1.0.0', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get()
  check() {
    return this.ready();
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('سرویس هنوز آماده نیست');
    }

    try {
      const pending = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
      `;
      const failedMigrations = Number(pending[0]?.count ?? 0);
      if (failedMigrations) throw new ServiceUnavailableException('سرویس هنوز آماده نیست');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('سرویس هنوز آماده نیست');
    }

    try {
      await this.storage.ensureReady();
    } catch {
      throw new ServiceUnavailableException('سرویس هنوز آماده نیست');
    }

    return {
      status: 'ok',
      ready: true,
      version: process.env.APP_VERSION ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('metrics')
  async metrics() {
    const [
      users,
      tenants,
      queuedJobs,
      runningJobs,
      deadJobs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.tenant.count({ where: { isActive: true, status: 'active' } }),
      this.prisma.automationJob.count({ where: { status: 'queued' } }),
      this.prisma.automationJob.count({ where: { status: 'running' } }),
      this.prisma.automationJob.count({ where: { status: 'dead' } }),
    ]);

    const memory = process.memoryUsage();
    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
      counts: {
        users,
        activeTenants: tenants,
        automationJobs: { queued: queuedJobs, running: runningJobs, dead: deadJobs },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
