import { Equals, IsBoolean, IsString, MaxLength } from 'class-validator';

export class DeletePlatformEntityDto {
  @IsBoolean()
  @Equals(true, { message: 'تأیید مرحله اول الزامی است' })
  confirmIrreversible!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'تأیید حذف همه وابستگی‌ها الزامی است' })
  confirmCascade!: boolean;

  @IsString()
  @MaxLength(320)
  confirmationText!: string;
}
