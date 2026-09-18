import { Global, Module } from '@nestjs/common';
import {
  ActivityService,
  AuditService,
  NotificationService,
} from './services/audit.service';
import { AutomationJobService } from './services/automation-job.service';
import { ContentWorkflowService } from './services/content-workflow.service';
import { IntegrationHealthService } from './services/integration-health.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { SignedUrlService } from './services/signed-url.service';
import { AssetAccessService } from './services/asset-access.service';
import { LocalStorageService } from './services/local-storage.service';
import { ObjectStorageService } from './services/object-storage.service';

@Global()
@Module({
  providers: [
    AuditService,
    ActivityService,
    NotificationService,
    AutomationJobService,
    ContentWorkflowService,
    IntegrationHealthService,
    DistributedLockService,
    SignedUrlService,
    AssetAccessService,
    LocalStorageService,
    ObjectStorageService,
  ],
  exports: [
    AuditService,
    ActivityService,
    NotificationService,
    AutomationJobService,
    ContentWorkflowService,
    IntegrationHealthService,
    DistributedLockService,
    SignedUrlService,
    AssetAccessService,
    LocalStorageService,
    ObjectStorageService,
  ],
})
export class CommonModule {}
