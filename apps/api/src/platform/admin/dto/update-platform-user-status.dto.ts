import { IsIn } from 'class-validator';
import { PLATFORM_USER_STATUS } from '@deska/shared';

export class UpdatePlatformUserStatusDto {
  @IsIn(Object.values(PLATFORM_USER_STATUS), { message: 'وضعیت کاربر معتبر نیست' })
  status!: string;
}
