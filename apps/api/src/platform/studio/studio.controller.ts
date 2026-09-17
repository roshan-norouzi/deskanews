import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx } from '../../common/decorators/params.decorator';
import type { TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { SetCustomFieldValuesDto } from './dto/set-custom-field-values.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { StudioService } from './studio.service';

@Controller('studio')
@UseGuards(JwtAuthGuard, TenantGuard, ModuleEnabledGuard, PermissionsGuard)
@RequireModule('studio')
export class StudioController {
  constructor(private studioService: StudioService) {}

  @Get('fields/by-entity/:entityType')
  findFieldsByEntity(
    @TenantCtx() tenant: TenantContext,
    @Param('entityType') entityType: string,
  ) {
    return this.studioService.findFields(tenant.tenantId, entityType);
  }

  @Get('fields')
  @RequirePermission('studio.manage')
  findFields(
    @TenantCtx() tenant: TenantContext,
    @Query('entityType') entityType?: string,
    @Query('moduleId') moduleId?: string,
  ) {
    return this.studioService.findFields(tenant.tenantId, entityType, moduleId);
  }

  @Get('fields/:id')
  @RequirePermission('studio.manage')
  findField(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.studioService.findField(tenant.tenantId, id);
  }

  @Post('fields')
  @RequirePermission('studio.manage')
  createField(@TenantCtx() tenant: TenantContext, @Body() dto: CreateCustomFieldDto) {
    return this.studioService.createField(tenant.tenantId, dto);
  }

  @Patch('fields/:id')
  @RequirePermission('studio.manage')
  updateField(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.studioService.updateField(tenant.tenantId, id, dto);
  }

  @Delete('fields/:id')
  @RequirePermission('studio.manage')
  removeField(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.studioService.removeField(tenant.tenantId, id);
  }

  @Get('values/:entityType/:entityId')
  getEntityValues(
    @TenantCtx() tenant: TenantContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.studioService.getEntityValues(tenant.tenantId, entityType, entityId);
  }

  @Put('values')
  setEntityValues(@TenantCtx() tenant: TenantContext, @Body() dto: SetCustomFieldValuesDto) {
    return this.studioService.setEntityValues(tenant.tenantId, dto);
  }
}
