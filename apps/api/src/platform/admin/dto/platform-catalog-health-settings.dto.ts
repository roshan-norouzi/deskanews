import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePlatformCatalogHealthSettingsDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  catalog_health_enabled?: 'true' | 'false';

  @IsOptional()
  @IsString()
  catalog_health_interval_hours?: string;
}
