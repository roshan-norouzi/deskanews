import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ContactsService } from './contacts.service';
import {
  ContactPayloadDto,
  ContactQueryDto,
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @RequirePermission('contacts.view')
  findAll(@TenantCtx() tenant: TenantContext, @Query() query: ContactQueryDto) {
    return this.contactsService.findAll(tenant.tenantId, query);
  }

  @Get(':id/bank-accounts')
  @RequirePermission('contacts.view')
  findBankAccounts(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.contactsService.findBankAccounts(tenant.tenantId, id);
  }

  @Post(':id/bank-accounts')
  @RequirePermission('contacts.update')
  createBankAccount(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body()
    body: CreateBankAccountDto,
  ) {
    return this.contactsService.createBankAccount(tenant.tenantId, id, body);
  }

  @Patch(':id/bank-accounts/:accountId')
  @RequirePermission('contacts.update')
  updateBankAccount(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body()
    body: UpdateBankAccountDto,
  ) {
    return this.contactsService.updateBankAccount(tenant.tenantId, id, accountId, body);
  }

  @Delete(':id/bank-accounts/:accountId')
  @RequirePermission('contacts.update')
  removeBankAccount(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Param('accountId') accountId: string,
  ) {
    return this.contactsService.removeBankAccount(tenant.tenantId, id, accountId);
  }

  @Get(':id')
  @RequirePermission('contacts.view')
  findOne(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.contactsService.findOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermission('contacts.create')
  create(
    @TenantCtx() tenant: TenantContext,
    @User() _user: AuthUser,
    @Body() body: ContactPayloadDto,
  ) {
    return this.contactsService.create(tenant.tenantId, { ...body });
  }

  @Patch(':id')
  @RequirePermission('contacts.update')
  update(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: ContactPayloadDto,
  ) {
    return this.contactsService.update(tenant.tenantId, id, { ...body });
  }

  @Delete(':id')
  @RequirePermission('contacts.delete')
  remove(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.contactsService.remove(tenant.tenantId, id);
  }

}
