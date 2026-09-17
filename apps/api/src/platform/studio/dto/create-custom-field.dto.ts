import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOM_FIELD_TYPES } from '@deska/shared';

export class CreateCustomFieldDto {
  @IsString({ message: 'شناسه ماژول باید متن باشد' })
  @IsNotEmpty({ message: 'شناسه ماژول الزامی است' })
  moduleId!: string;

  @IsString({ message: 'نوع موجودیت باید متن باشد' })
  @IsNotEmpty({ message: 'نوع موجودیت الزامی است' })
  entityType!: string;

  @IsString({ message: 'نام فیلد باید متن باشد' })
  @IsNotEmpty({ message: 'نام فیلد الزامی است' })
  @MaxLength(50, { message: 'نام فیلد نباید بیش از ۵۰ کاراکتر باشد' })
  fieldName!: string;

  @IsString({ message: 'برچسب فیلد باید متن باشد' })
  @IsNotEmpty({ message: 'برچسب فیلد الزامی است' })
  @MaxLength(100, { message: 'برچسب فیلد نباید بیش از ۱۰۰ کاراکتر باشد' })
  fieldLabel!: string;

  @IsIn(Object.values(CUSTOM_FIELD_TYPES), { message: 'نوع فیلد معتبر نیست' })
  fieldType!: string;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
