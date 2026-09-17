import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { User } from '../../common/decorators/params.decorator';
import { PlatformAdminService } from './platform-admin.service';
import { UpdatePlatformUserStatusDto } from './dto/update-platform-user-status.dto';
import { UpdatePlatformUserRoleDto } from './dto/update-platform-user-role.dto';
import { UpdateOrganizationStatusDto } from './dto/update-organization-status.dto';
import { PlatformTransferOwnershipDto } from './dto/platform-transfer-ownership.dto';
import { DeletePlatformEntityDto } from './dto/delete-platform-entity.dto';
import { CreatePlatformUserDto } from './dto/create-platform-user.dto';

@Controller('platform')
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Get('overview')
  overview(@User() actor: AuthUser) {
    return this.service.overview(actor);
  }

  @Get('users')
  users(
    @User() actor: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listUsers(actor, { q, status, role, page, limit });
  }

  @Post('users')
  createUser(@User() actor: AuthUser, @Body() dto: CreatePlatformUserDto) {
    return this.service.createUser(actor, dto);
  }

  @Get('users/:id')
  user(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.getUser(actor, id);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserStatusDto,
  ) {
    return this.service.updateUserStatus(actor, id, dto.status);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserRoleDto,
  ) {
    return this.service.updateUserRole(actor, id, dto.role);
  }

  @Delete('users/:id')
  deleteUser(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeletePlatformEntityDto,
  ) {
    return this.service.deleteUser(actor, id, dto);
  }

  @Get('organizations')
  organizations(
    @User() actor: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listOrganizations(actor, { q, status, page, limit });
  }

  @Get('organizations/:id')
  organization(@User() actor: AuthUser, @Param('id') id: string) {
    return this.service.getOrganization(actor, id);
  }

  @Patch('organizations/:id/status')
  updateOrganizationStatus(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationStatusDto,
  ) {
    return this.service.updateOrganizationStatus(actor, id, dto.status);
  }

  @Delete('organizations/:id')
  deleteOrganization(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeletePlatformEntityDto,
  ) {
    return this.service.deleteOrganization(actor, id, dto);
  }

  @Post('organizations/:id/transfer-ownership')
  transferOwnership(
    @User() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: PlatformTransferOwnershipDto,
  ) {
    return this.service.transferOwnership(actor, id, dto.targetUserId);
  }
}
