import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SAFE_CODE_PART = /^[\p{L}\p{N}_-]*$/u;

export class UpdateEmployeeCodeSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(SAFE_CODE_PART, { message: 'پیشوند فقط می‌تواند شامل حروف، عدد، خط تیره و زیرخط باشد' })
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(SAFE_CODE_PART, { message: 'پسوند فقط می‌تواند شامل حروف، عدد، خط تیره و زیرخط باشد' })
  suffix?: string;
}
