import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ORGANIZATIONAL_ROLES } from '@deska/shared';

export class InviteMemberDto {
  @IsString()
  @MinLength(10, { message: 'شناسه کاربر معتبر نیست' })
  @MaxLength(64)
  userId!: string;

  @IsIn([...ORGANIZATIONAL_ROLES], { message: 'نقش عضویت معتبر نیست' })
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
