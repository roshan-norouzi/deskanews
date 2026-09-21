import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsOrganizationAssignablePermission } from '../validators/organization-permission.validator';

export class AddMemberDto {
  @IsString()
  @MinLength(10, { message: 'شناسه کاربر معتبر نیست' })
  @MaxLength(64)
  userId!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'حداقل یک سطح دسترسی انتخاب کنید' })
  @IsOrganizationAssignablePermission({ each: true })
  permissions!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  newsroomServiceIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
