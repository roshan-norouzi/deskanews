import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'برچسب فیلد نباید بیش از ۱۰۰ کاراکتر باشد' })
  fieldLabel?: string;

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
