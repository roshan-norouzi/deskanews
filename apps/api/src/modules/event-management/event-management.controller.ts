import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import {
  CreateAgendaItemDto,
  CreateBudgetItemDto,
  CreateEventManagementProjectDto,
  CreateEventManagementTaskDto,
  DateAssessmentDto,
  GenerateChecklistDto,
  OpportunityAssessmentDto,
  UpdateEventManagementProjectDto,
  UpdateEventManagementTaskDto,
  UpdateBudgetItemDto,
} from './dto/event-management.dto';
import { EventManagementService } from './event-management.service';

@Controller('event-management')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('event-management')
@RequirePermission('event-management.view')
export class EventManagementController {
  constructor(private readonly service: EventManagementService) {}

  @Get('tools')
  tools() { return this.service.tools(); }

  @Get('projects')
  list(@TenantCtx() tenant: TenantContext, @Query('type') type?: string, @Query('status') status?: string) {
    return this.service.list(tenant.tenantId, type, status);
  }

  @Post('projects')
  @RequirePermission('event-management.manage')
  create(@TenantCtx() tenant: TenantContext, @User() user: AuthUser, @Body() body: CreateEventManagementProjectDto) {
    return this.service.create(tenant.tenantId, user.id, body);
  }

  @Post('date-assessment')
  @RequirePermission('event-management.manage')
  assessDate(@TenantCtx() tenant: TenantContext, @Body() body: DateAssessmentDto) {
    return this.service.assessDate(tenant.tenantId, body);
  }

  @Post('opportunity-assessment')
  @RequirePermission('event-management.manage')
  assessOpportunity(@Body() body: OpportunityAssessmentDto) {
    return this.service.assessOpportunity(body);
  }

  @Get('projects/:id')
  findOne(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.service.findOne(tenant.tenantId, id);
  }

  @Patch('projects/:id')
  @RequirePermission('event-management.manage')
  update(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateEventManagementProjectDto) {
    return this.service.update(tenant.tenantId, id, body);
  }

  @Delete('projects/:id')
  @RequirePermission('event-management.manage')
  remove(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.service.remove(tenant.tenantId, id);
  }

  @Post('projects/:id/generate-checklist')
  @RequirePermission('event-management.manage')
  generateChecklist(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: GenerateChecklistDto) {
    return this.service.generateChecklist(tenant.tenantId, id, body.replace ?? false);
  }

  @Post('projects/:id/tasks')
  @RequirePermission('event-management.manage')
  addTask(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: CreateEventManagementTaskDto) {
    return this.service.addTask(tenant.tenantId, id, body);
  }

  @Patch('tasks/:id')
  @RequirePermission('event-management.manage')
  updateTask(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateEventManagementTaskDto) {
    return this.service.updateTask(tenant.tenantId, id, body);
  }

  @Post('projects/:id/agenda')
  @RequirePermission('event-management.manage')
  addAgenda(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: CreateAgendaItemDto) {
    return this.service.addAgendaItem(tenant.tenantId, id, body);
  }

  @Post('projects/:id/budget')
  @RequirePermission('event-management.manage')
  addBudget(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: CreateBudgetItemDto) {
    return this.service.addBudgetItem(tenant.tenantId, id, body);
  }

  @Patch('budget/:id')
  @RequirePermission('event-management.manage')
  updateBudget(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateBudgetItemDto) {
    return this.service.updateBudgetItem(tenant.tenantId, id, body);
  }
}
