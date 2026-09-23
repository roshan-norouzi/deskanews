import { Global, Module } from '@nestjs/common';
import {
  ActivityService,
  AuditService,
  NotificationService,
} from './services/audit.service';
import { AutomationJobService } from './services/automation-job.service';
import { ContentWorkflowService } from './services/content-workflow.service';
import { IntegrationHealthService } from './services/integration-health.service';
import { BillingService } from './services/billing.service';
import { RedisCache } from './redis/redis-cache';
import { ObjectStorage } from './object-storage';
import { SchedulerLeaseService } from './services/scheduler-lease.service';
import { SchedulerRuntimeService } from './services/scheduler-runtime.service';

@Global()
@Module({
  providers: [
    AuditService,
    ActivityService,
    NotificationService,
    AutomationJobService,
    ContentWorkflowService,
    IntegrationHealthService,
    SchedulerLeaseService,
    SchedulerRuntimeService,
    BillingService,
    RedisCache,
    ObjectStorage,
  ],
  exports: [
    AuditService,
    ActivityService,
    NotificationService,
    AutomationJobService,
    ContentWorkflowService,
    IntegrationHealthService,
    SchedulerLeaseService,
    SchedulerRuntimeService,
    BillingService,
    RedisCache,
    ObjectStorage,
  ],
})
export class CommonModule {}
