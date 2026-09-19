import { IsIn } from 'class-validator';
import { PLATFORM_ROLES } from '@deska/shared';

export class UpdatePlatformUserRoleDto {
  @IsIn(Object.values(PLATFORM_ROLES), { message: 'نقش پلتفرم معتبر نیست' })
  role!: string;
}
