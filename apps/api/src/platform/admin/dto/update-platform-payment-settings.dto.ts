import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformPaymentSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;
}
