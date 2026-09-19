import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsOrganizationAssignablePermission } from '../validators/organization-permission.validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsArray()
  @IsOrganizationAssignablePermission({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
