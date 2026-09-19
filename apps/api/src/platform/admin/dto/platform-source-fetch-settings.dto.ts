import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformSourceFetchSettingsDto {
  @IsOptional() @IsString() @MaxLength(500) source_fetch_bridge_url?: string;
  @IsOptional() @IsString() @MaxLength(500) source_fetch_bridge_secret?: string;
  @IsOptional() @IsString() @MaxLength(20) source_fetch_bridge_secret_configured?: string;
}
