import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

@Module({
  controllers: [TenantController, EmployeeController],
  providers: [TenantService, EmployeeService],
  exports: [TenantService, EmployeeService],
})
export class TenantModule {}
