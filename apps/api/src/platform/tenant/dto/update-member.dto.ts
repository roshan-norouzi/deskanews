import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOrganizationAssignablePermission } from '../validators/organization-permission.validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'حداقل یک سطح دسترسی انتخاب کنید' })
  @IsOrganizationAssignablePermission({ each: true })
  permissions?: string[];

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
