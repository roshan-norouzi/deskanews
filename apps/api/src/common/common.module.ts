import { Global, Module } from '@nestjs/common';
import { NumberingService } from './services/numbering.service';
import {
  ActivityService,
  AuditService,
  NotificationService,
} from './services/audit.service';
import { AutomationJobService } from './services/automation-job.service';
import { ContentWorkflowService } from './services/content-workflow.service';
import { IntegrationHealthService } from './services/integration-health.service';

@Global()
@Module({
  providers: [NumberingService, AuditService, ActivityService, NotificationService, AutomationJobService, ContentWorkflowService, IntegrationHealthService],
  exports: [NumberingService, AuditService, ActivityService, NotificationService, AutomationJobService, ContentWorkflowService, IntegrationHealthService],
})
export class CommonModule {}
