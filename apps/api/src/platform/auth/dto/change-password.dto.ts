import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'رمز عبور فعلی الزامی است' })
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128, { message: 'رمز عبور جدید حداکثر ۱۲۸ کاراکتر است' })
  newPassword!: string;
}
