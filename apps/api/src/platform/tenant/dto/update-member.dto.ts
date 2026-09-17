import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORGANIZATIONAL_ROLES } from '@deska/shared';

const EDITABLE_TENANT_ROLES = [...ORGANIZATIONAL_ROLES] as const;

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(EDITABLE_TENANT_ROLES, { message: 'نقش عضویت معتبر نیست' })
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
