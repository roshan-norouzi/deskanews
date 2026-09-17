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
  ForbiddenException,
} from '@nestjs/common';
import { PLATFORM_ROLES } from '@deska/shared';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CalendarService, CalendarEventInput } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/calendar-event.dto';

@Controller('calendar/events')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @RequirePermission('calendar.view')
  findAll(
    @TenantCtx() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.calendarService.findAll(tenant.tenantId, from, to, entityType);
  }

  @Get(':id')
  @RequirePermission('calendar.view')
  findOne(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.calendarService.findOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermission('calendar.manage')
  create(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Body() body: CreateCalendarEventDto,
  ) {
    if (body.entityType === 'official_observance') this.assertSystemAdmin(user);
    return this.calendarService.create(tenant.tenantId, user.id, body);
  }

  @Patch(':id')
  @RequirePermission('calendar.manage')
  async update(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateCalendarEventDto,
  ) {
    const existing = await this.calendarService.findOne(tenant.tenantId, id);
    if (existing.entityType === 'official_observance' || body.entityType === 'official_observance') {
      this.assertSystemAdmin(user);
    }
    return this.calendarService.update(tenant.tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermission('calendar.manage')
  async remove(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @Param('id') id: string,
  ) {
    const existing = await this.calendarService.findOne(tenant.tenantId, id);
    if (existing.entityType === 'official_observance') this.assertSystemAdmin(user);
    return this.calendarService.remove(tenant.tenantId, id);
  }

  private assertSystemAdmin(user: AuthUser) {
    if (user.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('این بخش فقط برای مدیر کل سیستم مجاز است');
    }
  }

  @Patch(':id/attendees/:attendeeId')
  @RequirePermission('calendar.manage')
  updateAttendee(
    @TenantCtx() tenant: TenantContext,
    @Param('id') _eventId: string,
    @Param('attendeeId') attendeeId: string,
    @Body('status') status: string,
  ) {
    return this.calendarService.updateAttendeeStatus(tenant.tenantId, _eventId, attendeeId, status);
  }
}
