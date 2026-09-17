import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePlatformUserDto {
  @IsString({ message: 'نام باید متن باشد' })
  @IsNotEmpty({ message: 'نام الزامی است' })
  @MaxLength(120, { message: 'نام حداکثر ۱۲۰ کاراکتر است' })
  name!: string;

  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email!: string;

  @IsOptional()
  @IsString({ message: 'شماره تلفن باید متن باشد' })
  @Matches(/^(?:\+?[1-9]\d{7,14}|09\d{9})$/, { message: 'شماره تلفن معتبر نیست' })
  phone?: string;

  @IsString({ message: 'رمز عبور باید متن باشد' })
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password!: string;

  @IsString({ message: 'تکرار رمز عبور باید متن باشد' })
  @IsNotEmpty({ message: 'تکرار رمز عبور الزامی است' })
  confirmPassword!: string;
}
