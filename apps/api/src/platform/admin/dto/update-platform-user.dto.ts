import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام الزامی است' })
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام خانوادگی الزامی است' })
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\+?[1-9]\d{7,14}|09\d{9})$/, { message: 'شماره موبایل معتبر نیست' })
  phone?: string | null;
}
