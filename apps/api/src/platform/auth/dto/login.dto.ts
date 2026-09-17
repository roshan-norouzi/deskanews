import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'ایمیل الزامی است' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email!: string;

  @IsString({ message: 'رمز عبور باید متن باشد' })
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password!: string;
}
