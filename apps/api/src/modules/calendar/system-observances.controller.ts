import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PLATFORM_ROLES } from '@deska/shared';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { User } from '../../common/decorators/params.decorator';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CalendarService, SystemObservanceInput } from './calendar.service';
import { CreateSystemObservanceDto, UpdateSystemObservanceDto } from './dto/calendar-event.dto';

@Controller('calendar/system-observances')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('calendar')
export class SystemObservancesController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @RequirePermission('calendar.view')
  findAll() {
    return this.calendarService.findSystemObservances();
  }

  @Post()
  @RequirePermission('calendar.manage')
  create(@User() user: AuthUser, @Body() body: CreateSystemObservanceDto) {
    this.assertSystemAdmin(user);
    return this.calendarService.createSystemObservance(body);
  }

  @Patch(':id')
  @RequirePermission('calendar.manage')
  update(
    @User() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateSystemObservanceDto,
  ) {
    this.assertSystemAdmin(user);
    return this.calendarService.updateSystemObservance(id, body);
  }

  @Delete(':id')
  @RequirePermission('calendar.manage')
  remove(@User() user: AuthUser, @Param('id') id: string) {
    this.assertSystemAdmin(user);
    return this.calendarService.removeSystemObservance(id);
  }

  private assertSystemAdmin(user: AuthUser) {
    if (user.role !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('این بخش فقط برای مدیر کل سیستم مجاز است');
    }
  }
}
