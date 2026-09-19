import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';
import { Public } from '../../common/decorators/metadata.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

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

    if ((process.env.STORAGE_TYPE || 'local') === 'local') {
      const storagePath = path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'));
      try {
        await mkdir(storagePath, { recursive: true });
        await access(storagePath, constants.R_OK | constants.W_OK);
      } catch {
        throw new ServiceUnavailableException('سرویس هنوز آماده نیست');
      }
    }

    return {
      status: 'ok',
      ready: true,
      version: process.env.APP_VERSION ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
