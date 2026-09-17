import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CreateChecklistItemDto,
  CreateProjectDto,
  CreateTaskDto,
  DecideApprovalDto,
  ToggleChecklistItemDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('projects-tasks')
@RequirePermission('projects.view')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list(@TenantCtx() tenant: TenantContext) {
    return this.service.list(tenant.tenantId);
  }

  @Post()
  @RequirePermission('projects.manage')
  create(@TenantCtx() tenant: TenantContext, @Body() body: CreateProjectDto) {
    return this.service.create(tenant.tenantId, body);
  }

  @Patch(':id')
  @RequirePermission('projects.manage')
  update(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.service.update(tenant.tenantId, id, body);
  }

  @Get('tasks')
  tasks(@TenantCtx() tenant: TenantContext, @Query('projectId') projectId?: string) {
    return this.service.tasks(tenant.tenantId, projectId);
  }

  @Post('tasks')
  @RequirePermission('projects.manage')
  createTask(@TenantCtx() tenant: TenantContext, @Body() body: CreateTaskDto) {
    return this.service.createTask(tenant.tenantId, body);
  }

  @Patch('tasks/:id')
  @RequirePermission('projects.manage')
  updateTask(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: UpdateTaskDto) {
    return this.service.updateTask(tenant.tenantId, id, body);
  }

  @Post('tasks/:id/checklist')
  @RequirePermission('projects.manage')
  addChecklist(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: CreateChecklistItemDto) {
    return this.service.addChecklist(tenant.tenantId, id, body);
  }

  @Patch('checklist/:id')
  @RequirePermission('projects.manage')
  toggleChecklist(@TenantCtx() tenant: TenantContext, @Param('id') id: string, @Body() body: ToggleChecklistItemDto) {
    return this.service.toggleChecklist(tenant.tenantId, id, body.isDone);
  }

  @Get('tasks/:id/approvals')
  approvals(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.service.listApprovals(tenant.tenantId, id);
  }

  @Patch('approvals/:id')
  @RequirePermission('projects.approve')
  decide(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DecideApprovalDto,
  ) {
    return this.service.decideApproval(tenant.tenantId, user.id, id, body);
  }
}
