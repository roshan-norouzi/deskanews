import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EmployeeService } from './employee.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermission('employees.view')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  findEmployees(@TenantCtx() tenant: TenantContext, @Query('status') status?: string) {
    return this.employeeService.findEmployees(tenant.tenantId, status);
  }

  @Get('departments')
  findDepartments(@TenantCtx() tenant: TenantContext) {
    return this.employeeService.findDepartments(tenant.tenantId);
  }

  @Get(':id/profile')
  findEmployeeProfile(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.employeeService.findEmployeeProfile(tenant.tenantId, id);
  }
}
