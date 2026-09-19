import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { USAGE_METRIC_KEYS, type UsageMetricKey } from '@deska/shared';

const ALLOWED_USAGE_METRIC_KEYS = Object.values(USAGE_METRIC_KEYS) as UsageMetricKey[];

class UsageMetricUpdateItemDto {
  @IsIn(ALLOWED_USAGE_METRIC_KEYS, { message: 'فرایند مصرف معتبر نیست' })
  key!: UsageMetricKey;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateUsageMetricsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UsageMetricUpdateItemDto)
  metrics!: UsageMetricUpdateItemDto[];
}
