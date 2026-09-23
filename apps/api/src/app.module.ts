import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PlatformModule } from './platform/platform.module';
import { UsageTrackingModule } from './platform/usage/usage-tracking.module';
import { BusinessModulesModule } from './modules/modules.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { WorkerHttpGuard } from './common/guards/worker-http.guard';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '..', '.env'),
        join(process.cwd(), '..', '..', '.env'),
      ],
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 180,
        },
      ],
      storage: new RedisThrottlerStorage(),
    }),
    PrismaModule,
    CommonModule,
    UsageTrackingModule,
    PlatformModule,
    BusinessModulesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: WorkerHttpGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
