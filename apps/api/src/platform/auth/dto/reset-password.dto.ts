import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'توکن باید متن باشد' })
  @IsNotEmpty({ message: 'توکن الزامی است' })
  token!: string;

  @IsString({ message: 'رمز عبور باید متن باشد' })
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password!: string;

  @IsString({ message: 'تکرار رمز عبور باید متن باشد' })
  @IsNotEmpty({ message: 'تکرار رمز عبور الزامی است' })
  confirmPassword!: string;
}
