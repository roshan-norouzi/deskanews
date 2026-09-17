import { IsIn } from 'class-validator';
import { TENANT_STATUS } from '@deska/shared';

export class UpdateOrganizationStatusDto {
  @IsIn(Object.values(TENANT_STATUS), { message: 'وضعیت سازمان معتبر نیست' })
  status!: string;
}
