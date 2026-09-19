import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام الزامی است' })
  @MaxLength(60, { message: 'نام حداکثر ۶۰ کاراکتر است' })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام خانوادگی الزامی است' })
  @MaxLength(60, { message: 'نام خانوادگی حداکثر ۶۰ کاراکتر است' })
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\+?[1-9]\d{7,14}|09\d{9})$/, { message: 'شماره موبایل معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password?: string;
}
