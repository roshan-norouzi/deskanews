import { IsEmail, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(120, { message: 'نام حداکثر ۱۲۰ کاراکتر است' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\+?[1-9]\d{7,14}|09\d{9})$/, { message: 'شماره موبایل معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'آدرس تصویر باید HTTPS معتبر باشد' })
  @MaxLength(1000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;
}
