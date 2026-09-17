import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ToggleModuleDto } from './dto/toggle-module.dto';
import { ModulesService } from './modules.service';

@Controller('modules')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModulesController {
  constructor(private modulesService: ModulesService) {}

  @Get()
  listCatalog() {
    return this.modulesService.listCatalog();
  }

  @Get('tenant')
  listTenantModules(@TenantCtx() tenant: TenantContext) {
    return this.modulesService.listTenantModules(tenant.tenantId);
  }

  @Patch(':id/toggle')
  @UseGuards(PermissionsGuard)
  @RequirePermission('modules.manage')
  toggleModule(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: ToggleModuleDto,
  ) {
    return this.modulesService.toggleModule(tenant.tenantId, id, dto);
  }
}
