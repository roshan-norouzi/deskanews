import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CustomFieldValueItemDto {
  @IsString({ message: 'نام فیلد باید متن باشد' })
  @IsNotEmpty({ message: 'نام فیلد الزامی است' })
  fieldName!: string;

  @IsOptional()
  @IsString()
  valueText?: string;

  @IsOptional()
  @IsNumber()
  valueNumber?: number;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ معتبر نیست' })
  valueDate?: string;

  @IsOptional()
  @IsBoolean()
  valueBoolean?: boolean;

  @IsOptional()
  valueJson?: unknown;
}

export class SetCustomFieldValuesDto {
  @IsString({ message: 'نوع موجودیت باید متن باشد' })
  @IsNotEmpty({ message: 'نوع موجودیت الزامی است' })
  entityType!: string;

  @IsString({ message: 'شناسه موجودیت باید متن باشد' })
  @IsNotEmpty({ message: 'شناسه موجودیت الزامی است' })
  entityId!: string;

  @IsArray({ message: 'مقادیر باید آرایه باشد' })
  @ValidateNested({ each: true })
  @Type(() => CustomFieldValueItemDto)
  values!: CustomFieldValueItemDto[];
}
