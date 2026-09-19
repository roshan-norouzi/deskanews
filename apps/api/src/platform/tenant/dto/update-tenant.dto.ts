import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PLATFORM_PLANS } from '@deska/shared';

export class UpdateTenantDto {
  @IsOptional()
  @IsString({ message: 'نام سازمان باید متن باشد' })
  @MaxLength(100, { message: 'نام سازمان نباید بیش از ۱۰۰ کاراکتر باشد' })
  name?: string;

  @IsOptional()
  @IsIn(Object.keys(PLATFORM_PLANS), { message: 'پلن انتخاب‌شده معتبر نیست' })
  plan?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  settings?: Record<string, unknown>;
}
