import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'نشست تأیید دو مرحله‌ای الزامی است' })
  mfaToken!: string;

  @IsString()
  @IsNotEmpty({ message: 'کد تأیید الزامی است' })
  @MaxLength(32, { message: 'کد تأیید نامعتبر است' })
  code!: string;
}

export class MfaEnableDto {
  @IsString()
  @IsNotEmpty({ message: 'کد تأیید الزامی است' })
  @Length(6, 8, { message: 'کد تأیید باید ۶ رقم باشد' })
  code!: string;
}

export class MfaDisableDto {
  @IsString()
  @IsNotEmpty({ message: 'کد تأیید الزامی است' })
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  password!: string;
}
